export interface ServiceMetrics {
  serviceName: string;
  service_name?: string;
  totalSpans: number;
  total_spans?: number;
  errorSpans: number;
  error_spans?: number;
  errorRate: number; // percentage, e.g. 15.5 for 15.5%
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

export interface AnomalyThresholds {
  errorRateThresholdPercent: number; // default: 5.0%
  p95LatencyThresholdMs: number; // default: 1000ms
  p99LatencyThresholdMs: number; // default: 2000ms
  minSpansForEvaluation: number; // default: 5 (avoid alerting on trivial sample sizes)
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  errorRateThresholdPercent: 5.0,
  p95LatencyThresholdMs: 1000.0,
  p99LatencyThresholdMs: 2000.0,
  minSpansForEvaluation: 5,
};

export interface AnomalyEvaluation {
  isBreached: boolean;
  serviceName: string;
  errorRateBreached: boolean;
  p95Breached: boolean;
  p99Breached: boolean;
  summary: string;
  reasons: string[];
  metrics: ServiceMetrics;
  thresholds: AnomalyThresholds;
}
