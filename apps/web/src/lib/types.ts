import type {
  SpanTreeNode,
  CriticalFailurePath,
  FailureClassification,
  DiagnosisResult,
} from '@tracepulse/shared';

export type {
  SpanTreeNode,
  CriticalFailurePath,
  FailureClassification,
  DiagnosisResult,
};

export interface TraceTreeResponse {
  traceId: string;
  totalSpans: number;
  durationMs: number;
  services: string[];
  hasErrors: boolean;
  criticalPath: CriticalFailurePath;
  asciiTree: string;
  rootNodes: SpanTreeNode[];
}

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'MUTED';

export interface Incident {
  id: string;
  projectId: string;
  serviceName: string;
  traceId: string | null;
  errorRate: number;
  p99LatencyMs: number;
  summary: string;
  rootCauseMarkdown: string | null;
  status: IncidentStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    redis: 'up' | 'down';
    clickhouse: 'up' | 'down';
    postgres: 'up' | 'down';
  };
}

export interface ServiceMetrics {
  serviceName: string;
  service_name?: string;
  totalSpans: number;
  total_spans?: number;
  errorSpans: number;
  error_spans?: number;
  errorRate: number;
  error_rate?: number;
  p50LatencyMs: number;
  p50_latency_ms?: number;
  p95LatencyMs: number;
  p95_latency_ms?: number;
  p99LatencyMs: number;
  p99_latency_ms?: number;
  throughput?: number;
  throughputRpm?: number;
  sampleTraceId?: string;
  sample_trace_id?: string;
}

export interface RecentTraceItem {
  traceId: string;
  rootService: string;
  rootSpanName: string;
  statusCode: string;
  durationMs: number;
  startTime: string;
  spanCount: number;
}
