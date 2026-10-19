import React from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  Zap,
} from 'lucide-react';
import type { ServiceMetrics } from '@/lib/types';
import { formatMs, formatPercent, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export interface ServiceHealthCardsProps {
  services: ServiceMetrics[];
  onSelectTrace?: (traceId: string) => void;
}

export function ServiceHealthCards({
  services,
  onSelectTrace,
}: ServiceHealthCardsProps) {
  if (!services || services.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-800/80 bg-[#0f172a]/40 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-400 mb-3">
          <Layers className="h-6 w-6 text-gray-400" />
        </div>
        <h4 className="text-sm font-semibold text-white">No Telemetry Stream Detected</h4>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
          No service spans recorded in ClickHouse over the last moving window. Run the traffic simulator to feed real-time distributed spans.
        </p>
        <code className="inline-block mt-3 px-3 py-1 rounded bg-black/40 border border-gray-800 text-xs font-mono text-blue-400">
          pnpm simulate:chaos --duration 10 --rps 8
        </code>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {services.map((svc) => {
        const name = svc.service_name || svc.serviceName;
        const total = svc.total_spans ?? svc.totalSpans ?? 0;
        const errors = svc.error_spans ?? svc.errorSpans ?? 0;
        const errorRate = svc.error_rate ?? svc.errorRate ?? 0;
        const p50 = svc.p50_latency_ms ?? svc.p50LatencyMs ?? 0;
        const p95 = svc.p95_latency_ms ?? svc.p95LatencyMs ?? 0;
        const p99 = svc.p99_latency_ms ?? svc.p99LatencyMs ?? 0;
        const throughput =
          svc.throughput ?? svc.throughputRpm ?? Math.round(total / 5);
        const sampleTrace = svc.sample_trace_id || svc.sampleTraceId;

        const isErrorBreached = errorRate >= 5.0;
        const isLatencyBreached = p99 >= 2000;
        const hasAnomaly = isErrorBreached || isLatencyBreached;

        return (
          <div
            key={name}
            className={cn(
              'group relative rounded-2xl border bg-[#0f172a]/60 p-5 backdrop-blur-sm transition-all duration-200 hover:shadow-xl',
              hasAnomaly
                ? 'border-rose-500/40 hover:border-rose-500/60 bg-rose-500/[0.03]'
                : 'border-gray-800/80 hover:border-gray-700/80',
            )}
          >
            {/* Header: Service Name & Status Badge */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h4 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span className="truncate">{name}</span>
                </h4>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                  <Gauge className="h-3 w-3 text-blue-400" />
                  <span>{throughput} spans/min</span>
                  <span className="text-gray-600">•</span>
                  <span>{total.toLocaleString()} total</span>
                </div>
              </div>

              {hasAnomaly ? (
                <Badge variant="danger" size="xs" pulse>
                  BREACH
                </Badge>
              ) : (
                <Badge variant="success" size="xs">
                  HEALTHY
                </Badge>
              )}
            </div>

            {/* Error Rate Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400 font-medium">Error Rate</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    isErrorBreached ? 'text-rose-400' : 'text-emerald-400',
                  )}
                >
                  {formatPercent(errorRate)}
                  {errors > 0 && ` (${errors} err)`}
                </span>
              </div>
              <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isErrorBreached
                      ? 'bg-rose-500'
                      : errorRate > 0
                        ? 'bg-amber-400'
                        : 'bg-emerald-500',
                  )}
                  style={{ width: `${Math.min(Math.max(errorRate, 0), 100)}%` }}
                />
              </div>
            </div>

            {/* Latency Percentiles */}
            <div className="mt-4 pt-3 border-t border-gray-800/80 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-gray-900/60 p-2 border border-gray-800/50">
                <div className="text-[10px] uppercase font-semibold text-gray-500">
                  P50
                </div>
                <div className="text-xs font-mono font-bold text-gray-200 mt-0.5">
                  {formatMs(p50)}
                </div>
              </div>

              <div className="rounded-lg bg-gray-900/60 p-2 border border-gray-800/50">
                <div className="text-[10px] uppercase font-semibold text-gray-500">
                  P95
                </div>
                <div className="text-xs font-mono font-bold text-gray-200 mt-0.5">
                  {formatMs(p95)}
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg p-2 border',
                  isLatencyBreached
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : 'bg-gray-900/60 border-gray-800/50',
                )}
              >
                <div
                  className={cn(
                    'text-[10px] uppercase font-semibold',
                    isLatencyBreached ? 'text-rose-400' : 'text-gray-500',
                  )}
                >
                  P99
                </div>
                <div
                  className={cn(
                    'text-xs font-mono font-bold mt-0.5',
                    isLatencyBreached ? 'text-rose-400' : 'text-gray-200',
                  )}
                >
                  {formatMs(p99)}
                </div>
              </div>
            </div>

            {/* Sample Trace Explorer Action */}
            {sampleTrace && onSelectTrace && (
              <button
                onClick={() => onSelectTrace(sampleTrace)}
                className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-gray-900/80 hover:bg-blue-600/20 border border-gray-800 hover:border-blue-500/30 text-xs font-medium text-gray-300 hover:text-blue-300 transition-all group-hover:border-gray-700"
              >
                <span>Inspect Trace</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
