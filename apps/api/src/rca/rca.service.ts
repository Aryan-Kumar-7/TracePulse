import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import { SpanTreeService, normalizeTraceIdToUuid } from './span-tree.service';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { Incident } from '@prisma/client';
import { DiagnosisResult, SpanTree, CriticalFailurePath } from '@tracepulse/shared';

export interface StandaloneTraceDiagnosis {
  traceId: string;
  tree: SpanTree;
  criticalPath: CriticalFailurePath;
  asciiTree: string;
  diagnosis: DiagnosisResult;
}

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouseService: ClickHouseService,
    private readonly spanTreeService: SpanTreeService,
    private readonly aiDiagnosisService: AiDiagnosisService,
  ) {}

  /**
   * Diagnoses an incident by finding its trace, reconstructing the span tree,
   * isolating the critical failure path, and running AI diagnosis.
   * Persists the synthesized post-mortem and executive summary back into PostgreSQL.
   */
  async diagnoseIncident(
    incidentId: string,
    traceIdOverride?: string,
  ): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID "${incidentId}" not found.`);
    }

    let traceId = traceIdOverride || incident.traceId;

    // If no traceId on incident record, sample the most recent error trace from ClickHouse for this service
    if (!traceId) {
      traceId = await this.findRecentErrorTraceForService(incident.serviceName);
    }

    if (!traceId) {
      this.logger.warn(
        `No trace found in ClickHouse for service "${incident.serviceName}". Synthesizing metric-level report.`,
      );
      // Metric-level diagnosis fallback
      const fallbackReport = `# 🚨 Incident Diagnostic Report: ${incident.serviceName}
## Executive Summary & Severity
[P2 - Metric Breach] Service \`${incident.serviceName}\` breached anomaly thresholds with Error Rate of ${incident.errorRate}% and P99 Latency of ${incident.p99LatencyMs}ms.

## Failing Service & Endpoint/Query
- **Service:** \`${incident.serviceName}\`
- **Notice:** No sampled trace was recorded in the analytical window.

## Root Cause Analysis
Traffic volume or error rate spiked beyond safe operating bounds. ClickHouse recorded elevated error counts without a correlated trace payload.

## Remediation & Action Items
1. Validate connectivity from \`${incident.serviceName}\` to TracePulse Ingestion Gateway.
2. Check upstream load balancer and container CPU/memory resource utilization.
3. Review application error logs during the incident window.`;

      return this.prisma.incident.update({
        where: { id: incident.id },
        data: {
          rootCauseMarkdown: fallbackReport,
          updatedAt: new Date(),
        },
      });
    }

    // Fetch spans for trace
    const spans = await this.spanTreeService.getTraceSpans(traceId);
    const tree = this.spanTreeService.buildSpanTree(spans);
    const criticalPath = this.spanTreeService.extractCriticalFailurePath(tree);
    const asciiTree = this.spanTreeService.formatSpanTreeAscii(tree, criticalPath);

    this.logger.log(
      `Synthesizing AI diagnosis for incident ${incident.id} (service: ${incident.serviceName}, traceId: ${traceId}, totalSpans: ${tree.totalSpans})...`,
    );

    const diagnosis = await this.aiDiagnosisService.synthesizeDiagnosis({
      incidentId: incident.id,
      serviceName: incident.serviceName,
      traceId,
      tree,
      criticalPath,
      asciiTree,
      metrics: {
        errorRate: incident.errorRate,
        p99LatencyMs: incident.p99LatencyMs,
        totalSpans: tree.totalSpans,
      },
    });

    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      data: {
        traceId,
        rootCauseMarkdown: diagnosis.markdown,
        summary: diagnosis.summary || incident.summary,
        status: incident.status === 'OPEN' ? 'INVESTIGATING' : incident.status,
        updatedAt: new Date(),
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    this.logger.log(
      `Successfully updated incident ${incident.id} with AI post-mortem (provider: ${diagnosis.provider}, severity: ${diagnosis.severity}).`,
    );

    return updated;
  }

  /**
   * Diagnoses a trace directly without requiring an existing PostgreSQL incident record.
   */
  async diagnoseTrace(
    traceId: string,
    serviceNameHint?: string,
  ): Promise<StandaloneTraceDiagnosis> {
    const spans = await this.spanTreeService.getTraceSpans(traceId);
    const tree = this.spanTreeService.buildSpanTree(spans);
    const criticalPath = this.spanTreeService.extractCriticalFailurePath(tree);
    const asciiTree = this.spanTreeService.formatSpanTreeAscii(tree, criticalPath);

    const serviceName =
      serviceNameHint ||
      criticalPath.rootFailingSpan?.serviceName ||
      tree.rootNodes[0]?.serviceName ||
      'unknown-service';

    const diagnosis = await this.aiDiagnosisService.synthesizeDiagnosis({
      serviceName,
      traceId,
      tree,
      criticalPath,
      asciiTree,
    });

    return {
      traceId,
      tree,
      criticalPath,
      asciiTree,
      diagnosis,
    };
  }

  /**
   * Queries ClickHouse for the most recent error trace belonging to a given service.
   */
  private async findRecentErrorTraceForService(
    serviceName: string,
  ): Promise<string | null> {
    const query = `
      SELECT trace_id
      FROM default.spans
      WHERE service_name = {serviceName:String} AND status_code = 'ERROR'
      ORDER BY start_time DESC
      LIMIT 1
    `;

    try {
      const res = await this.clickhouseService.getClient().query({
        query,
        query_params: { serviceName },
        format: 'JSONEachRow',
      });
      const rows = (await res.json()) as Array<{ trace_id: string }>;
      return rows[0]?.trace_id || null;
    } catch (err: any) {
      this.logger.error(
        `Failed to find error trace for service ${serviceName}: ${err?.message || err}`,
      );
      return null;
    }
  }
}
