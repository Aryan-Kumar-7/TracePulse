'use client';

import React from 'react';
import type { ServiceMetrics } from '@/lib/types';
import { formatMs, formatPercent, cn } from '@/lib/utils';
import { BarChart3, TrendingUp } from 'lucide-react';

export interface LatencyChartsProps {
  services: ServiceMetrics[];
}

export function LatencyCharts({ services }: LatencyChartsProps) {
  if (!services || services.length === 0) return null;

  // Find max latency for relative scaling
  const maxLatency = Math.max(
    ...services.map((s) => Math.max(s.p99_latency_ms ?? s.p99LatencyMs ?? 0, 100)),
    500,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Latency Percentiles Distribution Chart */}
      <div className="rounded-2xl border border-gray-800/80 bg-[#0f172a]/60 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-400" />
              Latency Percentiles Comparison (P50 vs P95 vs P99)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Microservice latency distribution across moving 5-minute window
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-medium">
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> P50
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> P95
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> P99
            </span>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          {services.map((s) => {
            const name = s.service_name || s.serviceName;
            const p50 = s.p50_latency_ms ?? s.p50LatencyMs ?? 0;
            const p95 = s.p95_latency_ms ?? s.p95LatencyMs ?? 0;
            const p99 = s.p99_latency_ms ?? s.p99LatencyMs ?? 0;

            const p50Pct = Math.min((p50 / maxLatency) * 100, 100);
            const p95Pct = Math.min((p95 / maxLatency) * 100, 100);
            const p99Pct = Math.min((p99 / maxLatency) * 100, 100);

            return (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs">
                  <span className="font-semibold text-gray-200">{name}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
                    <span className="text-blue-300">{formatMs(p50)}</span>
                    <span>/</span>
                    <span className="text-amber-300">{formatMs(p95)}</span>
                    <span>/</span>
                    <span className="text-rose-400 font-bold">
                      {formatMs(p99)}
                    </span>
                  </div>
                </div>

                <div className="relative h-4 w-full bg-gray-900/80 rounded-md overflow-hidden border border-gray-800 flex items-center">
                  {/* P99 bar (underneath, widest) */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-rose-500/50 rounded-r-md transition-all duration-500"
                    style={{ width: `${Math.max(p99Pct, 1)}%` }}
                  />
                  {/* P95 bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-amber-500/70 rounded-r-md transition-all duration-500"
                    style={{ width: `${Math.max(p95Pct, 1)}%` }}
                  />
                  {/* P50 bar (front, shortest) */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-blue-500 rounded-r-md transition-all duration-500"
                    style={{ width: `${Math.max(p50Pct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Throughput & Error Rate Matrix */}
      <div className="rounded-2xl border border-gray-800/80 bg-[#0f172a]/60 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Throughput & Error Intensity
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Service span volume correlated with error rate spikes
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          {services.map((s) => {
            const name = s.service_name || s.serviceName;
            const total = s.total_spans ?? s.totalSpans ?? 0;
            const errorRate = s.error_rate ?? s.errorRate ?? 0;
            const errors = s.error_spans ?? s.errorSpans ?? 0;
            const maxSpans = Math.max(
              ...services.map((svc) => svc.total_spans ?? svc.totalSpans ?? 0),
              10,
            );
            const spanPct = Math.min((total / maxSpans) * 100, 100);

            return (
              <div key={name} className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs">
                  <span className="font-semibold text-gray-200">{name}</span>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-gray-300">{total} spans</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded font-semibold',
                        errorRate >= 5.0
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-300',
                      )}
                    >
                      {formatPercent(errorRate)} err
                    </span>
                  </div>
                </div>

                <div className="relative h-4 w-full bg-gray-900/80 rounded-md overflow-hidden border border-gray-800 flex items-center">
                  <div
                    className={cn(
                      'h-full rounded-r-md transition-all duration-500',
                      errorRate >= 5.0
                        ? 'bg-gradient-to-r from-blue-600 to-rose-500'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-500',
                    )}
                    style={{ width: `${Math.max(spanPct, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
