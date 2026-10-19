import { describe, it, expect } from 'vitest';
import { evaluateServiceAnomaly } from './anomaly-evaluator';
import { ServiceMetrics } from './anomaly.types';

describe('evaluateServiceAnomaly', () => {
  const healthyMetrics: ServiceMetrics = {
    serviceName: 'order-service',
    totalSpans: 500,
    errorSpans: 5,
    errorRate: 1.0, // 1%
    p50LatencyMs: 35,
    p95LatencyMs: 120,
    p99LatencyMs: 250,
    sampleTraceId: '11111111-2222-3333-4444-555555555555',
  };

  it('marks healthy telemetry as not breached', () => {
    const result = evaluateServiceAnomaly(healthyMetrics);
    expect(result.isBreached).toBe(false);
    expect(result.errorRateBreached).toBe(false);
    expect(result.p95Breached).toBe(false);
    expect(result.p99Breached).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('detects error rate spike exceeding threshold', () => {
    const spikeMetrics: ServiceMetrics = {
      ...healthyMetrics,
      errorSpans: 60,
      errorRate: 12.0, // 12% > 5%
    };

    const result = evaluateServiceAnomaly(spikeMetrics);
    expect(result.isBreached).toBe(true);
    expect(result.errorRateBreached).toBe(true);
    expect(result.p95Breached).toBe(false);
    expect(result.p99Breached).toBe(false);
    expect(result.summary).toContain('Error rate spiked to 12.0%');
  });

  it('detects P95 latency regression', () => {
    const p95Regression: ServiceMetrics = {
      ...healthyMetrics,
      p95LatencyMs: 1450, // > 1000ms
      p99LatencyMs: 1800, // < 2000ms
    };

    const result = evaluateServiceAnomaly(p95Regression);
    expect(result.isBreached).toBe(true);
    expect(result.errorRateBreached).toBe(false);
    expect(result.p95Breached).toBe(true);
    expect(result.summary).toContain('P95 latency surged to 1450ms');
  });

  it('detects P99 latency regression', () => {
    const p99Regression: ServiceMetrics = {
      ...healthyMetrics,
      p99LatencyMs: 2850, // > 2000ms
    };

    const result = evaluateServiceAnomaly(p99Regression);
    expect(result.isBreached).toBe(true);
    expect(result.p99Breached).toBe(true);
    expect(result.summary).toContain('P99 latency surged to 2850ms');
  });

  it('detects simultaneous error rate spike and latency regression', () => {
    const multiBreach: ServiceMetrics = {
      ...healthyMetrics,
      errorRate: 25.4,
      p99LatencyMs: 3100,
    };

    const result = evaluateServiceAnomaly(multiBreach);
    expect(result.isBreached).toBe(true);
    expect(result.errorRateBreached).toBe(true);
    expect(result.p99Breached).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('safeguards against low sample sizes', () => {
    const lowSampleMetrics: ServiceMetrics = {
      ...healthyMetrics,
      totalSpans: 3, // < minSpansForEvaluation (5)
      errorRate: 66.7, // 2 out of 3 failed
      p99LatencyMs: 5000,
    };

    const result = evaluateServiceAnomaly(lowSampleMetrics);
    expect(result.isBreached).toBe(false);
    expect(result.summary).toContain('Insufficient span volume');
  });

  it('respects custom override thresholds', () => {
    const result = evaluateServiceAnomaly(healthyMetrics, {
      errorRateThresholdPercent: 0.5, // 1% > 0.5%
    });
    expect(result.isBreached).toBe(true);
    expect(result.errorRateBreached).toBe(true);
  });
});
