export interface SpanTreeNode {
  spanId: string;
  parentSpanId: string;
  traceId: string;
  serviceName: string;
  name: string;
  kind: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  statusCode: string;
  statusMessage?: string;
  attributes: Record<string, string>;
  events?: Array<{
    time: string;
    name: string;
    attributes: Record<string, string>;
  }>;
  depth: number;
  isRoot: boolean;
  isFailing: boolean;
  children: SpanTreeNode[];
}

export interface SpanTree {
  traceId: string;
  rootNodes: SpanTreeNode[];
  totalSpans: number;
  services: string[];
  durationMs: number;
  hasErrors: boolean;
}

export type FailureClassification =
  | 'EXCEPTION'
  | 'HTTP_5XX'
  | 'DB_TIMEOUT'
  | 'LATENCY_BOTTLENECK'
  | 'UNKNOWN'
  | 'NONE';

export interface CriticalFailurePath {
  hasFailure: boolean;
  rootFailingSpan: SpanTreeNode | null;
  path: SpanTreeNode[];
  failureType: FailureClassification;
  errorMessage?: string;
  exceptionType?: string;
  httpStatusCode?: number;
  dbSystem?: string;
  dbStatement?: string;
  durationMs: number;
  impactedServices: string[];
}

export interface DiagnosisResult {
  summary: string;
  markdown: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  failingService?: string;
  rootCause?: string;
  provider: 'gemini' | 'heuristic_fallback';
  generatedAt: string;
}
