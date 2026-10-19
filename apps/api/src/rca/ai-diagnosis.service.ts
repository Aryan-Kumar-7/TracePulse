import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpanTree,
  CriticalFailurePath,
  DiagnosisResult,
} from '@tracepulse/shared';

export interface DiagnosisContext {
  incidentId?: string;
  serviceName: string;
  traceId: string;
  tree: SpanTree;
  criticalPath: CriticalFailurePath;
  asciiTree: string;
  metrics?: {
    errorRate?: number;
    p99LatencyMs?: number;
    p95LatencyMs?: number;
    totalSpans?: number;
  };
}

@Injectable()
export class AiDiagnosisService {
  private readonly logger = new Logger(AiDiagnosisService.name);
  private readonly geminiApiKey: string | undefined;
  private readonly geminiModel: string;

  constructor(private readonly configService: ConfigService) {
    this.geminiApiKey =
      process.env.GEMINI_API_KEY ||
      this.configService.get<string>('GEMINI_API_KEY') ||
      undefined;
    this.geminiModel =
      process.env.GEMINI_MODEL ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';
  }

  /**
   * Constructs the structured engineering prompt for the LLM.
   */
  buildDiagnosisPrompt(context: DiagnosisContext): string {
    const { serviceName, traceId, criticalPath, asciiTree, metrics } = context;
    const rootSpan = criticalPath.rootFailingSpan;

    const errorDetails = [
      `- Service Under Incident: \`${serviceName}\``,
      `- Sample Trace ID: \`${traceId}\``,
      `- Anomaly Metrics: Error Rate: ${metrics?.errorRate ?? 'N/A'}% | P99 Latency: ${metrics?.p99LatencyMs ?? 'N/A'}ms | Volume: ${metrics?.totalSpans ?? context.tree.totalSpans} spans`,
      `- Failure Classification: ${criticalPath.failureType}`,
      `- Root Failing Span: \`${rootSpan?.serviceName || 'unknown'}\` -> \`${rootSpan?.name || 'unknown'}\` (${rootSpan?.durationMs.toFixed(1) || 0}ms)`,
      criticalPath.errorMessage ? `- Error Message: "${criticalPath.errorMessage}"` : null,
      criticalPath.exceptionType ? `- Exception Type: \`${criticalPath.exceptionType}\`` : null,
      criticalPath.httpStatusCode ? `- HTTP Status Code: ${criticalPath.httpStatusCode}` : null,
      criticalPath.dbSystem ? `- Database System: ${criticalPath.dbSystem}` : null,
      criticalPath.dbStatement ? `- Database Query / Statement: \`${criticalPath.dbStatement}\`` : null,
      criticalPath.path.length > 0
        ? `- Failure Propagation Path: ${criticalPath.path.map((s) => `\`${s.serviceName}\` (${s.name})`).join(' ➔ ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return `You are a Principal Site Reliability Engineer (SRE) and AI Incident Investigator for TracePulse.
Analyze the following distributed telemetry trace, call hierarchy, and critical failure path to synthesize a comprehensive, production-grade root cause post-mortem.

==================== INCIDENT CONTEXT ====================
${errorDetails}

==================== SPAN TREE WATERFALL ====================
\`\`\`
${asciiTree}
\`\`\`

==================== OUTPUT SPECIFICATION ====================
Produce a structured post-mortem in Github Flavored Markdown. You MUST include EXACTLY the following 4 sections as level-2 headers:

## Executive Summary & Severity
State the incident severity ([P1 - Critical], [P2 - High], or [P3 - Medium]) and provide a concise 2-3 sentence executive summary explaining what happened, the user/system impact, and the origin.

## Failing Service & Endpoint/Query
Identify the exact service where the fault originated, the specific operation/endpoint or database query, and describe how the error propagated through the upstream microservice call chain.

## Root Cause Analysis
Explain the technical root cause in deep engineering detail (e.g., database lock contention, timeout exhaustion, unhandled exception, third-party dependency outage, thread/connection pool saturation). Contrast what was expected versus what occurred.

## Remediation & Action Items
Provide prioritized, concrete, and actionable engineering recommendations:
1. Immediate operational remediation (mitigation to restore service)
2. Permanent architectural/code fix (e.g. specific SQL index, connection pool sizing, query rewrite, error handling)
3. Defensive engineering (circuit breakers, exponential backoff with jitter, timeouts, graceful degradation)
4. Telemetry & Alerting improvements`;
  }

  /**
   * Synthesizes an incident diagnosis.
   * Invokes Google Gemini API if GEMINI_API_KEY is present,
   * otherwise falls back seamlessly to the resilient local heuristic synthesizer.
   */
  async synthesizeDiagnosis(context: DiagnosisContext): Promise<DiagnosisResult> {
    const apiKey =
      this.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      this.configService.get<string>('GEMINI_API_KEY');

    if (apiKey && apiKey.trim().length > 0) {
      try {
        return await this.callGeminiApi(context, apiKey.trim());
      } catch (err: any) {
        this.logger.warn(
          `Gemini API invocation failed (${err?.message || err}). Falling back to local heuristic synthesizer.`,
        );
      }
    } else {
      this.logger.debug(
        'GEMINI_API_KEY not configured. Using local heuristic RCA synthesizer.',
      );
    }

    return this.generateFallbackDiagnosis(context);
  }

  /**
   * Invokes the official Google Gemini REST API with timeout.
   */
  private async callGeminiApi(
    context: DiagnosisContext,
    apiKey: string,
  ): Promise<DiagnosisResult> {
    const prompt = this.buildDiagnosisPrompt(context);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const markdown =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!markdown || markdown.trim().length === 0) {
        throw new Error('Gemini returned an empty candidate text.');
      }

      // Extract one-line summary from the executive summary section
      const summaryMatch = markdown.match(
        /## Executive Summary & Severity[\r\n]+([\s\S]*?)(?=##|$)/i,
      );
      const rawSummary = summaryMatch ? summaryMatch[1].trim() : '';
      const firstLine =
        rawSummary
          .split('\n')
          .find((l) => l.trim().length > 0 && !l.startsWith('#')) ||
        `Anomaly detected in ${context.serviceName}`;

      const severity: 'P1' | 'P2' | 'P3' | 'P4' = markdown.includes('P1')
        ? 'P1'
        : markdown.includes('P2')
        ? 'P2'
        : 'P3';

      return {
        summary: firstLine.replace(/^[-*]\s*/, '').slice(0, 255),
        markdown,
        severity,
        failingService:
          context.criticalPath.rootFailingSpan?.serviceName || context.serviceName,
        rootCause: context.criticalPath.errorMessage || context.criticalPath.failureType,
        provider: 'gemini',
        generatedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Production-grade local heuristic RCA synthesizer.
   * Runs 100% offline with zero network dependencies.
   */
  generateFallbackDiagnosis(context: DiagnosisContext): DiagnosisResult {
    const { serviceName, traceId, criticalPath, asciiTree, metrics } = context;
    const rootSpan = criticalPath.rootFailingSpan;
    const failingService = rootSpan?.serviceName || serviceName;
    const operationName = rootSpan?.name || 'unknown-operation';
    const durationMs = rootSpan?.durationMs || context.tree.durationMs || 0;
    const errorMsg =
      criticalPath.errorMessage || rootSpan?.statusMessage || 'Unspecified system exception';
    const exceptionType = criticalPath.exceptionType || 'InternalException';
    const failureType = criticalPath.failureType;

    const isPaymentIssue =
      failingService.includes('payment') ||
      errorMsg.toLowerCase().includes('payment') ||
      criticalPath.httpStatusCode === 502 ||
      exceptionType.toLowerCase().includes('payment');

    const isDatabaseIssue =
      !isPaymentIssue &&
      (failureType === 'DB_TIMEOUT' ||
        failingService === 'postgres' ||
        failingService === 'mysql' ||
        Boolean(criticalPath.dbSystem) ||
        errorMsg.toLowerCase().includes('timeout') ||
        errorMsg.toLowerCase().includes('lock'));

    const severity: 'P1' | 'P2' | 'P3' =
      (metrics?.errorRate && metrics.errorRate > 20) || failureType === 'DB_TIMEOUT'
        ? 'P1'
        : 'P2';

    const pathChain =
      criticalPath.path.length > 0
        ? criticalPath.path.map((s) => `\`${s.serviceName}\``).join(' ➔ ')
        : `\`${serviceName}\``;

    let executiveSummary = '';
    let failingSection = '';
    let rcaSection = '';
    let remediationSection = '';

    if (isDatabaseIssue) {
      executiveSummary = `[${severity} - Critical Data Layer Lockout] Database lock wait timeout in \`${failingService}\` triggered cascading 5xx failures across downstream services (${pathChain}). Moving-window error rate reached ${metrics?.errorRate ?? 40}% with P99 latency degraded to ${metrics?.p99LatencyMs ?? durationMs.toFixed(0)}ms.`;

      failingSection = `- **Root Failing Component:** \`${failingService}\` (Database Engine)
- **Originating Statement:** \`${criticalPath.dbStatement || operationName}\`
- **Execution Latency:** ${durationMs.toFixed(1)}ms (Exceeded query lock timeout threshold)
- **Error Description:** \`${errorMsg}\` (${exceptionType})
- **Cascading Path:** ${pathChain}`;

      rcaSection = `An unindexed or high-contention row-level lock (\`FOR UPDATE\` or heavy bulk update) saturated database worker threads on \`${failingService}\`. When transaction lock hold times exceeded permissible bounds, PostgreSQL aborted incoming transactions with a \`Lock wait timeout exceeded\` exception.

Because the calling service (\`${criticalPath.path[criticalPath.path.length - 2]?.serviceName || 'upstream'}\`) had no circuit breaker or query timeout buffer, database thread starvation cascaded synchronously up the stack, turning client checkout requests into HTTP 500/502 errors.`;

      remediationSection = `1. **Immediate Action:** Terminate active blocking queries using \`pg_terminate_backend(pid)\` and temporarily scale down concurrent batch workers.
2. **Schema & Index Optimization:** Ensure an index exists on the filter and lock target columns (e.g. \`CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);\`).
3. **Query Refactoring:** Eliminate \`FOR UPDATE\` locks where optimistic locking with version checks (\`version = version + 1\`) can suffice.
4. **Resilience & Timeouts:** Set \`statement_timeout = '2000ms'\` and \`lock_timeout = '1500ms'\` in PostgreSQL session settings to prevent cascading thread stalls.`;
    } else if (isPaymentIssue) {
      executiveSummary = `[${severity} - Payment Provider Failure] Upstream payment processing gateway timeout on \`${failingService}\` caused checkout workflow failures across ${pathChain}.`;

      failingSection = `- **Failing Service:** \`${failingService}\`
- **Endpoint / Operation:** \`${operationName}\`
- **HTTP Code:** ${criticalPath.httpStatusCode || 502} (Bad Gateway / Upstream Timeout)
- **Exception:** \`${errorMsg}\` (${exceptionType})
- **Propagation:** ${pathChain}`;

      rcaSection = `The payment service attempted to invoke external payment APIs or downstream resources without sufficient timeout isolation. The upstream gateway either experienced an outage or exceeded the ${durationMs.toFixed(0)}ms round-trip allowance, bubbling up as a \`PaymentGatewayTimeoutException\`.`;

      remediationSection = `1. **Immediate Action:** Route traffic to secondary payment provider or enable asynchronous checkout queueing.
2. **Circuit Breaker:** Wrap payment gateway client in a Resilience4j/Opossum circuit breaker that trips after 3 consecutive timeouts.
3. **Exponential Backoff:** Implement jittered retries for transient HTTP 502/504 errors up to 2 attempts max.
4. **Asynchronous Processing:** Decouple order confirmation from payment settlement using an event-driven stream (e.g., Kafka / Redis Streams).`;
    } else {
      executiveSummary = `[${severity} - Service Degradation] Service \`${failingService}\` failed on operation \`${operationName}\` with ${errorMsg}, propagating errors up to \`${serviceName}\`.`;

      failingSection = `- **Failing Service:** \`${failingService}\`
- **Endpoint / Operation:** \`${operationName}\`
- **Status:** ${criticalPath.httpStatusCode ? `HTTP ${criticalPath.httpStatusCode}` : 'ERROR'}
- **Exception:** \`${errorMsg}\` (${exceptionType})
- **Impacted Call Path:** ${pathChain}`;

      rcaSection = `An unhandled exception (\`${exceptionType}\`) occurred during execution of \`${operationName}\` in \`${failingService}\`. The service was unable to catch or gracefully degrade, returning a failure to caller services and degrading end-to-end trace latency to ${durationMs.toFixed(1)}ms.`;

      remediationSection = `1. **Immediate Action:** Check service logs for \`${failingService}\` around timestamp of trace \`${traceId}\`.
2. **Error Boundary:** Add global exception filters and return standardized error envelopes.
3. **Health Checks:** Validate readiness probes to ensure failing pods are detached from the load balancer.
4. **Telemetry:** Add detailed span attributes and log correlation for \`${exceptionType}\`.`;
    }

    const markdown = `# 🚨 Incident Post-Mortem: ${failingService} Outage

## Executive Summary & Severity
${executiveSummary}

## Failing Service & Endpoint/Query
${failingSection}

## Root Cause Analysis
${rcaSection}

### Span Waterfall Snapshot:
\`\`\`
${asciiTree}
\`\`\`

## Remediation & Action Items
${remediationSection}
`;

    return {
      summary: executiveSummary.replace(/^\[.*?\]\s*/, '').slice(0, 255),
      markdown,
      severity,
      failingService,
      rootCause: errorMsg,
      provider: 'heuristic_fallback',
      generatedAt: new Date().toISOString(),
    };
  }
}
