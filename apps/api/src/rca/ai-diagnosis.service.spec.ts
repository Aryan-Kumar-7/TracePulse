import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiDiagnosisService, DiagnosisContext } from './ai-diagnosis.service';
import { ConfigService } from '@nestjs/config';
import { SpanTree, CriticalFailurePath } from '@tracepulse/shared';

describe('AiDiagnosisService', () => {
  let configService: ConfigService;
  let service: AiDiagnosisService;

  const mockSpanTree: SpanTree = {
    traceId: '11111111-2222-3333-4444-555555555555',
    rootNodes: [],
    totalSpans: 5,
    services: ['client-web', 'api-gateway', 'order-service', 'payment-service', 'postgres'],
    durationMs: 2500,
    hasErrors: true,
  };

  const mockCriticalPath: CriticalFailurePath = {
    hasFailure: true,
    failureType: 'DB_TIMEOUT',
    rootFailingSpan: {
      spanId: 's-db',
      parentSpanId: 's-payment',
      traceId: '11111111-2222-3333-4444-555555555555',
      serviceName: 'postgres',
      name: 'SELECT * FROM orders WHERE status = PENDING FOR UPDATE',
      kind: 'CLIENT',
      startTime: '2026-10-19 12:00:00.040000',
      endTime: '2026-10-19 12:00:02.440000',
      durationMs: 2400,
      statusCode: 'ERROR',
      statusMessage: 'QueryTimeoutException: Lock wait timeout exceeded',
      attributes: {
        'db.system': 'postgresql',
        'exception.type': 'QueryTimeoutException',
      },
      depth: 4,
      isRoot: false,
      isFailing: true,
      children: [],
    },
    path: [],
    errorMessage: 'QueryTimeoutException: Lock wait timeout exceeded',
    exceptionType: 'QueryTimeoutException',
    dbSystem: 'postgresql',
    dbStatement: 'SELECT * FROM orders WHERE status = PENDING FOR UPDATE',
    durationMs: 2400,
    impactedServices: ['client-web', 'order-service', 'payment-service', 'postgres'],
  };

  const mockContext: DiagnosisContext = {
    serviceName: 'order-service',
    traceId: '11111111-2222-3333-4444-555555555555',
    tree: mockSpanTree,
    criticalPath: mockCriticalPath,
    asciiTree: '[client-web] (2500ms)\n └── [postgres] 🚨 ROOT CAUSE: QueryTimeoutException',
    metrics: {
      errorRate: 45.2,
      p99LatencyMs: 2800,
      totalSpans: 5,
    },
  };

  beforeEach(() => {
    configService = new ConfigService({});
    service = new AiDiagnosisService(configService);
  });

  it('builds a structured engineering prompt with all required headers', () => {
    const prompt = service.buildDiagnosisPrompt(mockContext);

    expect(prompt).toContain('Executive Summary & Severity');
    expect(prompt).toContain('Failing Service & Endpoint/Query');
    expect(prompt).toContain('Root Cause Analysis');
    expect(prompt).toContain('Remediation & Action Items');
    expect(prompt).toContain('order-service');
    expect(prompt).toContain('QueryTimeoutException');
    expect(prompt).toContain('SELECT * FROM orders WHERE status = PENDING FOR UPDATE');
    expect(prompt).toContain(mockContext.asciiTree);
  });

  it('generates a resilient fallback post-mortem for database timeout incidents', () => {
    const diagnosis = service.generateFallbackDiagnosis(mockContext);

    expect(diagnosis.provider).toBe('heuristic_fallback');
    expect(diagnosis.severity).toBe('P1');
    expect(diagnosis.failingService).toBe('postgres');
    expect(diagnosis.markdown).toContain('## Executive Summary & Severity');
    expect(diagnosis.markdown).toContain('## Failing Service & Endpoint/Query');
    expect(diagnosis.markdown).toContain('## Root Cause Analysis');
    expect(diagnosis.markdown).toContain('## Remediation & Action Items');
    expect(diagnosis.markdown).toContain('Lock wait timeout');
    expect(diagnosis.markdown).toContain('idx_orders_status');
    expect(diagnosis.markdown).toContain('statement_timeout');
  });

  it('generates a resilient fallback post-mortem for payment gateway timeout incidents', () => {
    const paymentContext: DiagnosisContext = {
      ...mockContext,
      serviceName: 'payment-service',
      criticalPath: {
        ...mockCriticalPath,
        failureType: 'HTTP_5XX',
        httpStatusCode: 502,
        dbSystem: undefined,
        dbStatement: undefined,
        rootFailingSpan: {
          ...mockCriticalPath.rootFailingSpan!,
          serviceName: 'payment-service',
          name: 'process_payment_charge',
          statusMessage: 'PaymentGatewayTimeoutException: Upstream payment provider unreachable',
          attributes: { 'http.status_code': '502' },
        },
        errorMessage: 'PaymentGatewayTimeoutException: Upstream payment provider unreachable',
        exceptionType: 'PaymentGatewayTimeoutException',
      },
    };

    const diagnosis = service.generateFallbackDiagnosis(paymentContext);

    expect(diagnosis.markdown).toContain('## Executive Summary & Severity');
    expect(diagnosis.markdown).toContain('## Failing Service & Endpoint/Query');
    expect(diagnosis.markdown).toContain('## Root Cause Analysis');
    expect(diagnosis.markdown).toContain('## Remediation & Action Items');
    expect(diagnosis.markdown).toContain('Circuit Breaker');
    expect(diagnosis.markdown).toContain('Exponential Backoff');
  });

  it('synthesizes diagnosis using fallback when GEMINI_API_KEY is not set', async () => {
    const diagnosis = await service.synthesizeDiagnosis(mockContext);

    expect(diagnosis.provider).toBe('heuristic_fallback');
    expect(diagnosis.summary).toBeTruthy();
    expect(diagnosis.markdown).toContain('## Executive Summary & Severity');
    expect(diagnosis.markdown).toContain('## Remediation & Action Items');
  });

  it('invokes Gemini API when GEMINI_API_KEY is configured and falls back on network error', async () => {
    const customConfig = new ConfigService({
      GEMINI_API_KEY: 'test-api-key-12345',
    });
    const geminiService = new AiDiagnosisService(customConfig);

    // Mock global fetch rejection to verify resilience
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline or rate limited'));

    try {
      const diagnosis = await geminiService.synthesizeDiagnosis(mockContext);
      // Resilience check: Must not throw, but fall back seamlessly
      expect(diagnosis.provider).toBe('heuristic_fallback');
      expect(diagnosis.markdown).toContain('## Executive Summary & Severity');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('parses valid Gemini API response correctly', async () => {
    const customConfig = new ConfigService({
      GEMINI_API_KEY: 'valid-gemini-key',
    });
    const geminiService = new AiDiagnosisService(customConfig);

    const mockAiMarkdown = `# 🚨 Incident Post-Mortem: Postgres Lockout

## Executive Summary & Severity
[P1 - Critical] Database thread exhaustion triggered cascade.

## Failing Service & Endpoint/Query
- Service: postgres
- Query: SELECT * FROM orders FOR UPDATE

## Root Cause Analysis
Row-level lock contention on unindexed table.

## Remediation & Action Items
1. Add index on status column.`;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: mockAiMarkdown }],
            },
          },
        ],
      }),
    } as any);

    try {
      const diagnosis = await geminiService.synthesizeDiagnosis(mockContext);
      expect(diagnosis.provider).toBe('gemini');
      expect(diagnosis.severity).toBe('P1');
      expect(diagnosis.markdown).toBe(mockAiMarkdown);
      expect(diagnosis.summary).toContain('Database thread exhaustion');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
