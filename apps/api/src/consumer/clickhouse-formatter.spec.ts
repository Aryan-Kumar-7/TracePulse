import { describe, it, expect } from 'vitest';
import {
  formatClickHouseDateTime,
  mapSpanToClickHouseRow,
} from './clickhouse-formatter';
import { NormalizedSpan } from '@tracepulse/shared';

describe('ClickHouse Formatter', () => {
  describe('formatClickHouseDateTime', () => {
    it('formats ISO date strings into ClickHouse DateTime64 UTC format', () => {
      const iso = '2026-10-18T10:30:45.123Z';
      const formatted = formatClickHouseDateTime(iso);
      expect(formatted).toBe('2026-10-18 10:30:45.123000');
    });

    it('formats epoch timestamp numbers correctly', () => {
      const epoch = Date.UTC(2026, 9, 18, 12, 0, 0, 500);
      const formatted = formatClickHouseDateTime(epoch);
      expect(formatted).toBe('2026-10-18 12:00:00.500000');
    });

    it('handles invalid dates gracefully with fallback epoch', () => {
      const formatted = formatClickHouseDateTime('invalid-date');
      expect(formatted).toBe('1970-01-01 00:00:00.000000');
    });
  });

  describe('mapSpanToClickHouseRow', () => {
    it('maps NormalizedSpan to ClickHouse spans table schema with parallel event arrays', () => {
      const span: NormalizedSpan = {
        traceId: '11111111-2222-3333-4444-555555555555',
        spanId: '00f067aa0ba902b7',
        parentSpanId: '00f067aa0ba902b6',
        serviceName: 'payment-service',
        name: 'process_payment',
        kind: 'SERVER',
        startTime: '2026-10-18T12:00:00.000Z',
        endTime: '2026-10-18T12:00:00.250Z',
        durationMs: 250,
        statusCode: 'ERROR',
        statusMessage: 'Payment Gateway Timeout',
        attributes: {
          'http.status_code': '502',
          'payment.provider': 'stripe',
        },
        events: [
          {
            time: '2026-10-18T12:00:00.100Z',
            name: 'retry_attempt',
            attributes: { attempt: '1' },
          },
        ],
      };

      const row = mapSpanToClickHouseRow(span);

      expect(row.trace_id).toBe('11111111-2222-3333-4444-555555555555');
      expect(row.span_id).toBe('00f067aa0ba902b7');
      expect(row.parent_span_id).toBe('00f067aa0ba902b6');
      expect(row.service_name).toBe('payment-service');
      expect(row.name).toBe('process_payment');
      expect(row.kind).toBe('SERVER');
      expect(row.start_time).toBe('2026-10-18 12:00:00.000000');
      expect(row.end_time).toBe('2026-10-18 12:00:00.250000');
      expect(row.duration_ms).toBe(250);
      expect(row.status_code).toBe('ERROR');
      expect(row.status_message).toBe('Payment Gateway Timeout');
      expect(row.attributes).toEqual({
        'http.status_code': '502',
        'payment.provider': 'stripe',
      });
      expect(row['events_nested.time']).toEqual(['2026-10-18 12:00:00.100000']);
      expect(row['events_nested.name']).toEqual(['retry_attempt']);
      expect(row['events_nested.attributes']).toEqual([{ attempt: '1' }]);
    });
  });
});
