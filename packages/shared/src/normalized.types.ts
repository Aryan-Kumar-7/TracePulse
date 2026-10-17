/**
 * Normalized Span model matching ClickHouse `default.spans` table schema and downstream consumers.
 */
export interface NormalizedEvent {
  time: string; // ISO 8601 with microseconds or UTC formatted
  name: string;
  attributes: Record<string, string>;
}

export type SpanStatusCode = 'OK' | 'ERROR' | 'UNSET';

export interface NormalizedSpan {
  traceId: string; // Valid UUID or 32-char hex string
  spanId: string;
  parentSpanId: string;
  serviceName: string;
  name: string;
  kind: string; // 'SERVER', 'CLIENT', 'INTERNAL', 'PRODUCER', 'CONSUMER', 'UNSPECIFIED'
  startTime: string; // ISO 8601 string
  endTime: string; // ISO 8601 string
  durationMs: number;
  statusCode: SpanStatusCode;
  statusMessage: string;
  attributes: Record<string, string>;
  events: NormalizedEvent[];
}

/**
 * Envelope for payloads queued into Redis Streams
 */
export interface TraceStreamPayload {
  traceId: string;
  serviceName: string;
  spansCount: number;
  spans: NormalizedSpan[];
  ingestedAt: number; // Unix epoch ms
}
