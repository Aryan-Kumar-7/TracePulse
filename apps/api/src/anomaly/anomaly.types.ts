export interface ServiceMetrics {
  serviceName: string;
  totalSpans: number;
  errorSpans: number;
  errorRate: number; // percentage, e.g. 15.5 for 15.5%
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  sampleTraceId?: string;
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
