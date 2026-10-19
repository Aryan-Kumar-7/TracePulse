import { describe, it, expect } from 'vitest';
import { SpanTreeService, normalizeTraceIdToUuid, RawClickHouseSpan } from './span-tree.service';

describe('SpanTreeService', () => {
  // Mock ClickHouseService
  const mockClickHouseService: any = {
    getClient: () => ({
      query: async () => ({
        json: async () => [],
      }),
    }),
  };

  const service = new SpanTreeService(mockClickHouseService);

  const traceId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const traceUuid = 'a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90';

  it('normalizes 32-char hex trace ID to RFC 4122 UUID', () => {
    const formatted = normalizeTraceIdToUuid(traceId);
    expect(formatted).toBe(traceUuid);
    expect(formatted).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('correctly builds span tree with deep hierarchy in O(N) time', () => {
    const rawSpans: RawClickHouseSpan[] = [
      {
        trace_id: traceUuid,
        span_id: 'span-client',
        parent_span_id: '',
        service_name: 'client-web',
        name: 'checkout_button_click',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:02.500000',
        duration_ms: 2500,
        status_code: 'ERROR',
        status_message: 'HTTP 500',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 'span-gw',
        parent_span_id: 'span-client',
        service_name: 'api-gateway',
        name: 'POST /v1/checkout',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.010000',
        end_time: '2026-10-19 12:00:02.490000',
        duration_ms: 2480,
        status_code: 'ERROR',
        status_message: 'HTTP 500',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 'span-order',
        parent_span_id: 'span-gw',
        service_name: 'order-service',
        name: 'create_order',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.020000',
        end_time: '2026-10-19 12:00:02.470000',
        duration_ms: 2450,
        status_code: 'ERROR',
        status_message: 'Downstream payment failed',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 'span-payment',
        parent_span_id: 'span-order',
        service_name: 'payment-service',
        name: 'process_payment_charge',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.030000',
        end_time: '2026-10-19 12:00:02.450000',
        duration_ms: 2420,
        status_code: 'ERROR',
        status_message: 'PaymentGatewayTimeoutException: Upstream payment provider unreachable',
        attributes: {
          'http.status_code': '502',
          'exception.type': 'PaymentGatewayTimeoutException',
        },
      },
      {
        trace_id: traceUuid,
        span_id: 'span-db',
        parent_span_id: 'span-payment',
        service_name: 'postgres',
        name: 'SELECT * FROM orders WHERE status = PENDING FOR UPDATE',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.040000',
        end_time: '2026-10-19 12:00:02.440000',
        duration_ms: 2400,
        status_code: 'ERROR',
        status_message: 'QueryTimeoutException: Lock wait timeout exceeded',
        attributes: {
          'db.system': 'postgresql',
          'exception.type': 'QueryTimeoutException',
          'db.operation': 'SELECT',
        },
      },
    ];

    const tree = service.buildSpanTree(rawSpans);

    expect(tree.totalSpans).toBe(5);
    expect(tree.hasErrors).toBe(true);
    expect(tree.services).toHaveLength(5);
    expect(tree.rootNodes).toHaveLength(1);

    const root = tree.rootNodes[0];
    expect(root.spanId).toBe('span-client');
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(1);

    const gw = root.children[0];
    expect(gw.spanId).toBe('span-gw');
    expect(gw.depth).toBe(1);

    const order = gw.children[0];
    expect(order.spanId).toBe('span-order');
    expect(order.depth).toBe(2);

    const payment = order.children[0];
    expect(payment.spanId).toBe('span-payment');
    expect(payment.depth).toBe(3);

    const db = payment.children[0];
    expect(db.spanId).toBe('span-db');
    expect(db.depth).toBe(4);
    expect(db.children).toHaveLength(0);
  });

  it('gracefully handles missing parents by promoting orphaned spans to roots', () => {
    const orphanedSpans: RawClickHouseSpan[] = [
      {
        trace_id: traceUuid,
        span_id: 'span-orphan',
        parent_span_id: 'span-missing-parent-1234', // Parent not in trace payload
        service_name: 'auth-service',
        name: 'verify_token',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:00.050000',
        duration_ms: 50,
        status_code: 'OK',
      },
      {
        trace_id: traceUuid,
        span_id: 'span-orphan-child',
        parent_span_id: 'span-orphan',
        service_name: 'redis-cache',
        name: 'GET session:token',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.010000',
        end_time: '2026-10-19 12:00:00.020000',
        duration_ms: 10,
        status_code: 'OK',
      },
    ];

    const tree = service.buildSpanTree(orphanedSpans);
    expect(tree.totalSpans).toBe(2);
    expect(tree.rootNodes).toHaveLength(1);
    expect(tree.rootNodes[0].spanId).toBe('span-orphan');
    expect(tree.rootNodes[0].children[0].spanId).toBe('span-orphan-child');
  });

  it('pinpoints the exact root failing leaf in a cascading error failure path', () => {
    const cascadingSpans: RawClickHouseSpan[] = [
      {
        trace_id: traceUuid,
        span_id: 's-web',
        parent_span_id: '',
        service_name: 'client-web',
        name: 'render_page',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:01.000000',
        duration_ms: 1000,
        status_code: 'ERROR',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 's-order',
        parent_span_id: 's-web',
        service_name: 'order-service',
        name: 'checkout',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.010000',
        end_time: '2026-10-19 12:00:00.990000',
        duration_ms: 980,
        status_code: 'ERROR',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 's-db',
        parent_span_id: 's-order',
        service_name: 'postgres',
        name: 'SELECT * FROM orders WHERE status = PENDING FOR UPDATE',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.020000',
        end_time: '2026-10-19 12:00:00.980000',
        duration_ms: 960,
        status_code: 'ERROR',
        status_message: 'QueryTimeoutException: Lock wait timeout exceeded',
        attributes: {
          'db.system': 'postgresql',
          'exception.type': 'QueryTimeoutException',
        },
      },
    ];

    const tree = service.buildSpanTree(cascadingSpans);
    const criticalPath = service.extractCriticalFailurePath(tree);

    expect(criticalPath.hasFailure).toBe(true);
    expect(criticalPath.rootFailingSpan?.spanId).toBe('s-db');
    expect(criticalPath.rootFailingSpan?.serviceName).toBe('postgres');
    expect(criticalPath.failureType).toBe('DB_TIMEOUT');
    expect(criticalPath.exceptionType).toBe('QueryTimeoutException');
    expect(criticalPath.path.map((s) => s.spanId)).toEqual(['s-web', 's-order', 's-db']);
    expect(criticalPath.impactedServices).toEqual(['client-web', 'order-service', 'postgres']);
  });

  it('detects high-latency bottleneck when no explicit error status exists', () => {
    const latencySpans: RawClickHouseSpan[] = [
      {
        trace_id: traceUuid,
        span_id: 's-gw',
        parent_span_id: '',
        service_name: 'api-gateway',
        name: 'GET /items',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:02.100000',
        duration_ms: 2100,
        status_code: 'OK',
      },
      {
        trace_id: traceUuid,
        span_id: 's-db',
        parent_span_id: 's-gw',
        service_name: 'postgres',
        name: 'SELECT * FROM items WHERE full_scan = true',
        kind: 'CLIENT',
        start_time: '2026-10-19 12:00:00.050000',
        end_time: '2026-10-19 12:00:02.050000',
        duration_ms: 2000,
        status_code: 'OK',
      },
    ];

    const tree = service.buildSpanTree(latencySpans);
    const criticalPath = service.extractCriticalFailurePath(tree);

    expect(criticalPath.hasFailure).toBe(true);
    expect(criticalPath.failureType).toBe('LATENCY_BOTTLENECK');
    expect(criticalPath.rootFailingSpan?.spanId).toBe('s-db');
    expect(criticalPath.durationMs).toBe(2000);
  });

  it('renders a formatted ASCII waterfall with root cause tags', () => {
    const spans: RawClickHouseSpan[] = [
      {
        trace_id: traceUuid,
        span_id: 'root',
        parent_span_id: '',
        service_name: 'api-gateway',
        name: 'POST /checkout',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:00.500000',
        duration_ms: 500,
        status_code: 'ERROR',
        attributes: { 'http.status_code': '500' },
      },
      {
        trace_id: traceUuid,
        span_id: 'child',
        parent_span_id: 'root',
        service_name: 'payment-service',
        name: 'charge',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.010000',
        end_time: '2026-10-19 12:00:00.490000',
        duration_ms: 480,
        status_code: 'ERROR',
        status_message: 'StripeTimeoutException',
      },
    ];

    const tree = service.buildSpanTree(spans);
    const criticalPath = service.extractCriticalFailurePath(tree);
    const ascii = service.formatSpanTreeAscii(tree, criticalPath);

    expect(ascii).toContain('[api-gateway] POST /checkout (500.0ms) [ERROR ⚠️]');
    expect(ascii).toContain('└── [payment-service] charge (480.0ms) [ERROR ⚠️]');
    expect(ascii).toContain('🚨 [ROOT CAUSE]');
  });
});
