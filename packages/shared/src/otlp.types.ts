/**
 * OpenTelemetry OTLP/HTTP JSON Ingestion Protocol Definitions
 * Specification: https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto
 */

export interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number; // JSON standard supports int64 as string or number
  doubleValue?: number;
  arrayValue?: { values: OtlpAnyValue[] };
  kvlistValue?: { values: OtlpKeyValue[] };
  bytesValue?: string;
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpInstrumentationScope {
  name: string;
  version?: string;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export enum OtlpSpanKind {
  SPAN_KIND_UNSPECIFIED = 0,
  SPAN_KIND_INTERNAL = 1,
  SPAN_KIND_SERVER = 2,
  SPAN_KIND_CLIENT = 3,
  SPAN_KIND_PRODUCER = 4,
  SPAN_KIND_CONSUMER = 5,
}

export enum OtlpStatusCode {
  STATUS_CODE_UNSET = 0,
  STATUS_CODE_OK = 1,
  STATUS_CODE_ERROR = 2,
}

export interface OtlpStatus {
  message?: string;
  code: OtlpStatusCode | string | number;
}

export interface OtlpEvent {
  timeUnixNano: string | number;
  name: string;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpLink {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  traceState?: string;
  parentSpanId?: string;
  name: string;
  kind?: OtlpSpanKind | string | number;
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
  events?: OtlpEvent[];
  droppedEventsCount?: number;
  links?: OtlpLink[];
  droppedLinksCount?: number;
  status?: OtlpStatus;
}

export interface OtlpScopeSpans {
  scope?: OtlpInstrumentationScope;
  spans: OtlpSpan[];
  schemaUrl?: string;
}

export interface OtlpResource {
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
  schemaUrl?: string;
}

/**
 * Top-level payload matching POST /v1/traces in OpenTelemetry OTLP/HTTP JSON
 */
export interface ExportTraceServiceRequest {
  resourceSpans?: OtlpResourceSpans[];
}

export interface ExportTracePartialSuccess {
  rejectedSpans?: number;
  errorMessage?: string;
}

export interface ExportTraceServiceResponse {
  partialSuccess?: ExportTracePartialSuccess;
}
