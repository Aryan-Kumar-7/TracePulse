import {
  AnomalyEvaluation,
  AnomalyThresholds,
  DEFAULT_ANOMALY_THRESHOLDS,
  ServiceMetrics,
} from './anomaly.types';

/**
 * Pure evaluation function assessing whether a service's moving-window telemetry
 * breaches anomaly thresholds (error rates or latency regressions).
 */
export function evaluateServiceAnomaly(
  metrics: ServiceMetrics,
  customThresholds?: Partial<AnomalyThresholds>,
): AnomalyEvaluation {
  const thresholds: AnomalyThresholds = {
    ...DEFAULT_ANOMALY_THRESHOLDS,
    ...customThresholds,
  };

  const reasons: string[] = [];

  // Safeguard: Do not trigger alerts on trivial or statistically insignificant sample sizes
  if (metrics.totalSpans < thresholds.minSpansForEvaluation) {
    return {
      isBreached: false,
      serviceName: metrics.serviceName,
      errorRateBreached: false,
      p95Breached: false,
      p99Breached: false,
      summary: `${metrics.serviceName}: Insufficient span volume (${metrics.totalSpans} < ${thresholds.minSpansForEvaluation}) for anomaly evaluation.`,
      reasons: [],
      metrics,
      thresholds,
    };
  }

  const errorRateBreached =
    metrics.errorRate > thresholds.errorRateThresholdPercent;
  const p95Breached = metrics.p95LatencyMs > thresholds.p95LatencyThresholdMs;
  const p99Breached = metrics.p99LatencyMs > thresholds.p99LatencyThresholdMs;

  if (errorRateBreached) {
    reasons.push(
      `Error rate spiked to ${metrics.errorRate.toFixed(1)}% (threshold: ${thresholds.errorRateThresholdPercent}%)`,
    );
  }

  if (p99Breached) {
    reasons.push(
      `P99 latency surged to ${metrics.p99LatencyMs.toFixed(0)}ms (threshold: ${thresholds.p99LatencyThresholdMs}ms)`,
    );
  } else if (p95Breached) {
    reasons.push(
      `P95 latency surged to ${metrics.p95LatencyMs.toFixed(0)}ms (threshold: ${thresholds.p95LatencyThresholdMs}ms)`,
    );
  }

  const isBreached = errorRateBreached || p95Breached || p99Breached;

  const summary = isBreached
    ? `[Anomaly Alert] ${metrics.serviceName}: ${reasons.join(' | ')}`
    : `${metrics.serviceName}: All telemetry metrics healthy (Error rate: ${metrics.errorRate.toFixed(1)}%, P99: ${metrics.p99LatencyMs.toFixed(0)}ms)`;

  return {
    isBreached,
    serviceName: metrics.serviceName,
    errorRateBreached,
    p95Breached,
    p99Breached,
    summary,
    reasons,
    metrics,
    thresholds,
  };
}
