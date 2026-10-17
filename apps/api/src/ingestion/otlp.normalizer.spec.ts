import { describe, it, expect } from 'vitest';
import {
  formatToUuid,
  extractAnyValue,
  flattenAttributes,
  normalizeOtlpSpan,
  normalizeExportTraceRequest,
} from './otlp.normalizer';
import { ExportTraceServiceRequest } from '@tracepulse/shared';

describe('OTLP Normalizer', () => {
  describe('formatToUuid', () => {
    it('formats a 32-char hex traceId into standard 8-4-4-4-12 UUID format', () => {
      const hex = '4bf92f3577b34da6a3ce929d0e0e4736';
      const uuid = formatToUuid(hex);
      expect(uuid).toBe('4bf92f35-77b3-4da6-a3ce-929d0e0e4736');
    });

    it('handles empty or short traceId gracefully with padding', () => {
      expect(formatToUuid('')).toBe('00000000-0000-0000-0000-000000000000');
      expect(formatToUuid('abc')).toBe('abc00000-0000-0000-0000-000000000000');
    });
  });

  describe('extractAnyValue', () => {
    it('extracts stringValue, intValue, boolValue, doubleValue correctly', () => {
      expect(extractAnyValue({ stringValue: 'test' })).toBe('test');
      expect(extractAnyValue({ intValue: 42 })).toBe('42');
      expect(extractAnyValue({ doubleValue: 3.14 })).toBe('3.14');
      expect(extractAnyValue({ boolValue: true })).toBe('true');
    });

    it('extracts nested array and kvlist', () => {
      expect(
        extractAnyValue({
          arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
        }),
      ).toBe('["a","b"]');
    });
  });

  describe('normalizeExportTraceRequest', () => {
    it('normalizes full OTLP ExportTraceServiceRequest payload', () => {
      const mockRequest: ExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'order-service' } },
                { key: 'host.name', value: { stringValue: 'node-pod-1' } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'http-tracer', version: '1.0.0' },
                spans: [
                  {
                    traceId: '5b8aa5a2d2c872e8321cf37308d69df2',
                    spanId: '051581bf3cb55c13',
                    name: 'POST /orders',
                    kind: 2, // SPAN_KIND_SERVER
                    startTimeUnixNano: '1700000000000000000',
                    endTimeUnixNano: '1700000000150000000', // +150ms
                    attributes: [
                      { key: 'http.status_code', value: { intValue: 200 } },
                      { key: 'http.method', value: { stringValue: 'POST' } },
                    ],
                    status: { code: 1 }, // OK
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = normalizeExportTraceRequest(mockRequest);
      expect(result.totalSpans).toBe(1);
      expect(result.payloads.length).toBe(1);

      const batch = result.payloads[0];
      expect(batch.traceId).toBe('5b8aa5a2-d2c8-72e8-321c-f37308d69df2');
      expect(batch.serviceName).toBe('order-service');
      expect(batch.spansCount).toBe(1);

      const span = batch.spans[0];
      expect(span.name).toBe('POST /orders');
      expect(span.kind).toBe('SERVER');
      expect(span.statusCode).toBe('OK');
      expect(span.durationMs).toBe(150);
      expect(span.attributes['service.name']).toBe('order-service');
      expect(span.attributes['http.status_code']).toBe('200');
    });

    it('infers ERROR status when HTTP status code >= 500 or error attribute is set', () => {
      const span = normalizeOtlpSpan(
        {
          traceId: '5b8aa5a2d2c872e8321cf37308d69df2',
          spanId: '1111222233334444',
          name: 'GET /failing',
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000000050000000',
          attributes: [
            { key: 'http.status_code', value: { intValue: 503 } },
          ],
        },
        'payment-service',
        {},
      );

      expect(span.statusCode).toBe('ERROR');
    });
  });
});
