import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnomalyEvaluation,
  AnomalyThresholds,
  DEFAULT_ANOMALY_THRESHOLDS,
  ServiceMetrics,
} from './anomaly.types';
import { evaluateServiceAnomaly } from './anomaly-evaluator';
import { Incident } from '@prisma/client';
import { RcaService } from '../rca/rca.service';

export interface ClickHouseMetricsRow {
  service_name: string;
  total_spans: string | number;
  error_spans: string | number;
  error_rate: string | number;
  p50_latency_ms: string | number;
  p95_latency_ms: string | number;
  p99_latency_ms: string | number;
  sample_error_trace_id?: string;
  sample_trace_id?: string;
}

@Injectable()
export class AnomalyDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnomalyDetectorService.name);
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private readonly clickhouseService: ClickHouseService,
    private readonly prisma: PrismaService,
    private readonly rcaService: RcaService,
  ) {}

  onModuleInit() {
    this.logger.log('Starting Anomaly & Regression Detection service (evaluating every 30s)...');

    // Run first check after a brief warmup delay (5s), then every 30s
    setTimeout(() => {
      this.runCheck().catch((err) =>
        this.logger.error(`Initial anomaly check failed: ${err?.message || err}`),
      );
    }, 5000);

    this.checkInterval = setInterval(() => {
      this.runCheck().catch((err) =>
        this.logger.error(`Scheduled anomaly check failed: ${err?.message || err}`),
      );
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.logger.log('Anomaly Detection service stopped.');
  }

  /**
   * Fetches or provisions the default Project entity in PostgreSQL.
   */
  async getOrCreateDefaultProject() {
    let project = await this.prisma.project.findFirst();
    if (!project) {
      let user = await this.prisma.user.findFirst();
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: 'admin@tracepulse.internal',
            name: 'TracePulse Admin',
            role: 'ADMIN',
          },
        });
      }

      project = await this.prisma.project.create({
        data: {
          name: 'TracePulse Core',
          slug: 'default',
          ownerId: user.id,
        },
      });
      this.logger.log(`Created default Project (${project.id}) for incident management.`);
    }
    return project;
  }

  /**
   * Queries ClickHouse for moving-window metrics over the last 5 minutes.
   */
  async queryMovingWindowMetrics(windowMinutes = 5): Promise<ServiceMetrics[]> {
    const query = `
      SELECT
        service_name,
        count() AS total_spans,
        countIf(status_code = 'ERROR') AS error_spans,
        round((error_spans / total_spans) * 100, 2) AS error_rate,
        round(quantile(0.50)(duration_ms), 2) AS p50_latency_ms,
        round(quantile(0.95)(duration_ms), 2) AS p95_latency_ms,
        round(quantile(0.99)(duration_ms), 2) AS p99_latency_ms,
        anyIf(trace_id, status_code = 'ERROR') AS sample_error_trace_id,
        any(trace_id) AS sample_trace_id
      FROM default.spans
      WHERE start_time >= now() - INTERVAL ${windowMinutes} MINUTE
      GROUP BY service_name
      HAVING total_spans >= 1
      ORDER BY error_rate DESC, p99_latency_ms DESC
    `;

    try {
      const res = await this.clickhouseService.getClient().query({
        query,
        format: 'JSONEachRow',
      });
      const rows = (await res.json()) as ClickHouseMetricsRow[];

      return rows.map((r) => {
        const sampleTraceId =
          r.sample_error_trace_id &&
          r.sample_error_trace_id !== '00000000-0000-0000-0000-000000000000'
            ? r.sample_error_trace_id
            : r.sample_trace_id;

        return {
          serviceName: r.service_name,
          totalSpans: Number(r.total_spans) || 0,
          errorSpans: Number(r.error_spans) || 0,
          errorRate: Number(r.error_rate) || 0,
          p50LatencyMs: Number(r.p50_latency_ms) || 0,
          p95LatencyMs: Number(r.p95_latency_ms) || 0,
          p99LatencyMs: Number(r.p99_latency_ms) || 0,
          sampleTraceId,
        };
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to query moving-window metrics from ClickHouse: ${err?.message || err}`,
        err?.stack,
      );
      return [];
    }
  }

  /**
   * Executes anomaly evaluation across monitored services and persists open Incidents to PostgreSQL.
   */
  async runCheck(): Promise<{
    evaluatedServices: number;
    anomaliesBreached: number;
    incidents: Incident[];
  }> {
    if (this.isChecking) {
      return { evaluatedServices: 0, anomaliesBreached: 0, incidents: [] };
    }

    this.isChecking = true;
    const incidents: Incident[] = [];

    try {
      const project = await this.getOrCreateDefaultProject();
      const serviceMetricsList = await this.queryMovingWindowMetrics(5);

      if (serviceMetricsList.length === 0) {
        return { evaluatedServices: 0, anomaliesBreached: 0, incidents: [] };
      }

      // Check for any service-specific alert rules in PostgreSQL
      const alertRules = await this.prisma.alertRule.findMany({
        where: {
          projectId: project.id,
          status: 'ACTIVE',
        },
      });

      let anomaliesBreachedCount = 0;

      for (const metrics of serviceMetricsList) {
        // Resolve custom alert rules if configured for this service
        const customThresholds: Partial<AnomalyThresholds> = {};
        for (const rule of alertRules) {
          if (rule.serviceName === metrics.serviceName) {
            if (rule.metric === 'ERROR_RATE') {
              customThresholds.errorRateThresholdPercent = rule.threshold;
            } else if (rule.metric === 'P99_LATENCY') {
              customThresholds.p99LatencyThresholdMs = rule.threshold;
            } else if (rule.metric === 'P95_LATENCY') {
              customThresholds.p95LatencyThresholdMs = rule.threshold;
            }
          }
        }

        const evaluation = evaluateServiceAnomaly(metrics, customThresholds);

        if (evaluation.isBreached) {
          anomaliesBreachedCount++;
          const incident = await this.handleBreachedAnomaly(project.id, evaluation);
          if (incident) {
            incidents.push(incident);
          }
        }
      }

      if (anomaliesBreachedCount > 0) {
        this.logger.warn(
          `Evaluated ${serviceMetricsList.length} services: ${anomaliesBreachedCount} anomaly breach(es) detected.`,
        );
      }

      return {
        evaluatedServices: serviceMetricsList.length,
        anomaliesBreached: anomaliesBreachedCount,
        incidents,
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Upserts open Incident record in PostgreSQL to avoid duplicates while tracking current metrics.
   */
  private async handleBreachedAnomaly(
    projectId: string,
    evaluation: AnomalyEvaluation,
  ): Promise<Incident | null> {
    try {
      const existingIncident = await this.prisma.incident.findFirst({
        where: {
          projectId,
          serviceName: evaluation.serviceName,
          status: { in: ['OPEN', 'INVESTIGATING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingIncident) {
        // Update existing open incident with latest metrics
        const updated = await this.prisma.incident.update({
          where: { id: existingIncident.id },
          data: {
            errorRate: evaluation.metrics.errorRate,
            p99LatencyMs: evaluation.metrics.p99LatencyMs,
            summary: evaluation.summary,
            updatedAt: new Date(),
          },
        });

        // If the incident has not had an AI RCA post-mortem synthesized yet, trigger it now
        if (
          !existingIncident.rootCauseMarkdown ||
          existingIncident.rootCauseMarkdown.includes('Auto-created by TracePulse')
        ) {
          this.rcaService
            .diagnoseIncident(
              existingIncident.id,
              evaluation.metrics.sampleTraceId || existingIncident.traceId || undefined,
            )
            .catch((err) =>
              this.logger.error(
                `Automated RCA diagnosis failed for existing incident ${existingIncident.id}: ${err?.message || err}`,
              ),
            );
        }

        return updated;
      }

      // Create new open Incident
      const created = await this.prisma.incident.create({
        data: {
          projectId,
          serviceName: evaluation.serviceName,
          traceId: evaluation.metrics.sampleTraceId || null,
          errorRate: evaluation.metrics.errorRate,
          p99LatencyMs: evaluation.metrics.p99LatencyMs,
          summary: evaluation.summary,
          rootCauseMarkdown: `### 🚨 Incident Diagnostic Snapshot
- **Service Affected:** \`${evaluation.serviceName}\`
- **Evaluation Window:** 5 Minutes Moving Average
- **Breach Triggers:**
${evaluation.reasons.map((r) => `  - ${r}`).join('\n')}
- **Telemetry Metrics:**
  - **Error Rate:** ${evaluation.metrics.errorRate}%
  - **P99 Latency:** ${evaluation.metrics.p99LatencyMs}ms
  - **P95 Latency:** ${evaluation.metrics.p95LatencyMs}ms
  - **P50 Latency:** ${evaluation.metrics.p50LatencyMs}ms
  - **Sample Volume:** ${evaluation.metrics.totalSpans} spans

*Auto-created by TracePulse Anomaly Detector. AI Root Cause Analysis (Phase 3) will synthesize span waterfall.*`,
          status: 'OPEN',
        },
      });

      this.logger.warn(
        `🚨 [INCIDENT CREATED] ${created.id} for service "${evaluation.serviceName}": ${evaluation.summary}`,
      );

      // Asynchronously trigger AI Root-Cause Analysis diagnosis without blocking the detection loop
      this.rcaService
        .diagnoseIncident(created.id, created.traceId || undefined)
        .catch((err) =>
          this.logger.error(
            `Automated RCA diagnosis failed for incident ${created.id}: ${err?.message || err}`,
          ),
        );

      return created;
    } catch (err: any) {
      this.logger.error(
        `Failed to persist incident for ${evaluation.serviceName}: ${err?.message || err}`,
        err?.stack,
      );
      return null;
    }
  }
}
