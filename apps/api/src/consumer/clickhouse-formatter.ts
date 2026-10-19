import { NormalizedSpan } from '@tracepulse/shared';

export interface ClickHouseSpanRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_name: string;
  name: string;
  kind: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status_code: string;
  status_message: string;
  attributes: Record<string, string>;
  'events_nested.time': string[];
  'events_nested.name': string[];
  'events_nested.attributes': Record<string, string>[];
}

/**
 * Formats a Date or ISO date string into ClickHouse DateTime64(6, 'UTC') string:
 * Format: "YYYY-MM-DD HH:MM:SS.ffffff"
 */
export function formatClickHouseDateTime(d: string | number | Date): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (isNaN(date.getTime())) {
    return '1970-01-01 00:00:00.000000';
  }

  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  const Y = date.getUTCFullYear();
  const M = pad(date.getUTCMonth() + 1);
  const D = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const m = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  const ms = pad(date.getUTCMilliseconds(), 3);

  return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}000`;
}

/**
 * Maps NormalizedSpan domain objects to ClickHouse row models.
 */
export function mapSpanToClickHouseRow(span: NormalizedSpan): ClickHouseSpanRow {
  const events = span.events || [];

  return {
    trace_id: span.traceId,
    span_id: span.spanId || '',
    parent_span_id: span.parentSpanId || '',
    service_name: span.serviceName || 'unknown-service',
    name: span.name || 'unnamed-span',
    kind: span.kind || 'INTERNAL',
    start_time: formatClickHouseDateTime(span.startTime),
    end_time: formatClickHouseDateTime(span.endTime),
    duration_ms: Number(span.durationMs) || 0,
    status_code: span.statusCode || 'UNSET',
    status_message: span.statusMessage || '',
    attributes: span.attributes || {},
    'events_nested.time': events.map((e) => formatClickHouseDateTime(e.time)),
    'events_nested.name': events.map((e) => e.name || ''),
    'events_nested.attributes': events.map((e) => e.attributes || {}),
  };
}
