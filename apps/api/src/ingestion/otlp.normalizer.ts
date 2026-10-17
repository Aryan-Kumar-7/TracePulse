import {
  ExportTraceServiceRequest,
  NormalizedSpan,
  NormalizedEvent,
  OtlpAnyValue,
  OtlpKeyValue,
  OtlpSpan,
  SpanStatusCode,
  TraceStreamPayload,
} from '@tracepulse/shared';

/**
 * Ensures a 32-character hex trace ID is formatted as an 8-4-4-4-12 UUID string
 * so ClickHouse's UUID column parses it natively with zero overhead.
 */
export function formatToUuid(id: string): string {
  if (!id) return '00000000-0000-0000-0000-000000000000';
  const clean = id.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').slice(0, 32);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

/**
 * Extracts primitive scalar string from OpenTelemetry AnyValue
 */
export function extractAnyValue(val?: OtlpAnyValue): string {
  if (!val) return '';
  if (val.stringValue !== undefined) return String(val.stringValue);
  if (val.intValue !== undefined) return String(val.intValue);
  if (val.doubleValue !== undefined) return String(val.doubleValue);
  if (val.boolValue !== undefined) return String(val.boolValue);
  if (val.bytesValue !== undefined) return String(val.bytesValue);
  if (val.arrayValue?.values) {
    return JSON.stringify(val.arrayValue.values.map(extractAnyValue));
  }
  if (val.kvlistValue?.values) {
    return JSON.stringify(
      Object.fromEntries(
        val.kvlistValue.values.map((kv) => [kv.key, extractAnyValue(kv.value)]),
      ),
    );
  }
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
}

/**
 * Flattens array of OtlpKeyValue into Record<string, string>
 */
export function flattenAttributes(attrs?: OtlpKeyValue[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!attrs || !Array.isArray(attrs)) return result;

  for (const attr of attrs) {
    if (attr.key) {
      result[attr.key] = extractAnyValue(attr.value);
    }
  }
  return result;
}

/**
 * Maps OTLP span kind to readable LowCardinality string
 */
export function mapSpanKind(kind?: number | string): string {
  if (typeof kind === 'string') {
    return kind.replace(/^SPAN_KIND_/, '');
  }
  switch (kind) {
    case 1:
      return 'INTERNAL';
    case 2:
      return 'SERVER';
    case 3:
      return 'CLIENT';
    case 4:
      return 'PRODUCER';
    case 5:
      return 'CONSUMER';
    default:
      return 'UNSPECIFIED';
  }
}

/**
 * Maps OTLP status code
 */
export function mapStatusCode(
  status?: OtlpSpan['status'],
  attributes?: Record<string, string>,
): { code: SpanStatusCode; message: string } {
  let code: SpanStatusCode = 'UNSET';
  const message = status?.message || '';

  const rawCode = status?.code;
  if (rawCode === 1 || rawCode === 'STATUS_CODE_OK' || rawCode === 'OK') {
    code = 'OK';
  } else if (
    rawCode === 2 ||
    rawCode === 'STATUS_CODE_ERROR' ||
    rawCode === 'ERROR'
  ) {
    code = 'ERROR';
  }

  // Automatic error detection from attributes (HTTP 5xx, uncaught exception flags)
  if (code === 'UNSET' && attributes) {
    const httpStatus = attributes['http.status_code'] || attributes['http.response.status_code'];
    if (httpStatus && parseInt(httpStatus, 10) >= 500) {
      code = 'ERROR';
    }
    if (attributes['error'] === 'true' || attributes['exception.type']) {
      code = 'ERROR';
    }
  }

  return { code, message };
}

/**
 * Normalizes a raw OpenTelemetry span into a NormalizedSpan
 */
export function normalizeOtlpSpan(
  span: OtlpSpan,
  serviceName: string,
  resourceAttributes: Record<string, string>,
): NormalizedSpan {
  const spanAttributes = {
    ...resourceAttributes,
    ...flattenAttributes(span.attributes),
  };

  // Timestamps in nanoseconds
  const startNano = BigInt(span.startTimeUnixNano || 0);
  const endNano = BigInt(span.endTimeUnixNano || span.startTimeUnixNano || 0);

  const durationNs = endNano - startNano;
  const durationMs = Number(durationNs) / 1_000_000;

  // Convert nano epoch to ISO string
  const startMs = Number(startNano / 1_000_000n);
  const endMs = Number(endNano / 1_000_000n);
  const startTime = startMs > 0 ? new Date(startMs).toISOString() : new Date().toISOString();
  const endTime = endMs > 0 ? new Date(endMs).toISOString() : startTime;

  const { code: statusCode, message: statusMessage } = mapStatusCode(
    span.status,
    spanAttributes,
  );

  const events: NormalizedEvent[] = (span.events || []).map((evt) => {
    const evtNano = BigInt(evt.timeUnixNano || 0);
    const evtMs = Number(evtNano / 1_000_000n);
    return {
      time: evtMs > 0 ? new Date(evtMs).toISOString() : startTime,
      name: evt.name || '',
      attributes: flattenAttributes(evt.attributes),
    };
  });

  return {
    traceId: formatToUuid(span.traceId),
    spanId: span.spanId || '',
    parentSpanId: span.parentSpanId || '',
    serviceName,
    name: span.name || 'unnamed-operation',
    kind: mapSpanKind(span.kind),
    startTime,
    endTime,
    durationMs: durationMs >= 0 ? durationMs : 0,
    statusCode,
    statusMessage,
    attributes: spanAttributes,
    events,
  };
}

/**
 * Parses full ExportTraceServiceRequest and groups into Redis stream payloads by traceId
 */
export function normalizeExportTraceRequest(
  payload: ExportTraceServiceRequest,
): { payloads: TraceStreamPayload[]; totalSpans: number } {
  const traceMap = new Map<string, { serviceName: string; spans: NormalizedSpan[] }>();
  let totalSpans = 0;

  if (!payload?.resourceSpans || !Array.isArray(payload.resourceSpans)) {
    return { payloads: [], totalSpans: 0 };
  }

  for (const resourceSpan of payload.resourceSpans) {
    const resourceAttrs = flattenAttributes(resourceSpan.resource?.attributes);
    const serviceName =
      resourceAttrs['service.name'] ||
      resourceAttrs['app.name'] ||
      resourceAttrs['service'] ||
      'unknown-service';

    for (const scopeSpan of resourceSpan.scopeSpans || []) {
      for (const span of scopeSpan.spans || []) {
        const normalized = normalizeOtlpSpan(span, serviceName, resourceAttrs);
        totalSpans++;

        const existing = traceMap.get(normalized.traceId);
        if (existing) {
          existing.spans.push(normalized);
        } else {
          traceMap.set(normalized.traceId, {
            serviceName,
            spans: [normalized],
          });
        }
      }
    }
  }

  const now = Date.now();
  const payloads: TraceStreamPayload[] = [];
  for (const [traceId, group] of traceMap.entries()) {
    payloads.push({
      traceId,
      serviceName: group.serviceName,
      spansCount: group.spans.length,
      spans: group.spans,
      ingestedAt: now,
    });
  }

  return { payloads, totalSpans };
}
