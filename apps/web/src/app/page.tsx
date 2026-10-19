'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Flame,
  Gauge,
  Layers,
  Radio,
  Server,
  ShieldAlert,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Incident, ServiceMetrics } from '@/lib/types';
import { formatMs, formatNumber, formatPercent } from '@/lib/utils';
import { Navbar } from '@/components/layout/Navbar';
import { MetricStatCard } from '@/components/overview/MetricStatCard';
import { ServiceHealthCards } from '@/components/overview/ServiceHealthCards';
import { LatencyCharts } from '@/components/overview/LatencyCharts';
import { IncidentList } from '@/components/incident/IncidentList';
import { TraceExplorer } from '@/components/trace/TraceExplorer';
import { Button } from '@/components/ui/Button';

function DashboardContent() {
  const searchParams = useSearchParams();
  const initialTrace = searchParams?.get('traceId') || null;
  const initialTab = (searchParams?.get('tab') as any) || 'overview';

  const [activeTab, setActiveTab] = useState<'overview' | 'incidents' | 'traces'>(
    initialTab === 'traces' || initialTab === 'incidents' ? initialTab : 'overview',
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(initialTrace);

  const [services, setServices] = useState<ServiceMetrics[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = async (isManual = false) => {
    try {
      if (isManual) setIsRefreshing(true);
      setFetchError(null);

      const [metricsRes, incidentsRes] = await Promise.allSettled([
        api.getServiceMetrics(5),
        api.getIncidents({ limit: 50 }),
      ]);

      if (metricsRes.status === 'fulfilled') {
        setServices(metricsRes.value);
      } else {
        console.warn('Failed to fetch service metrics:', metricsRes.reason);
      }

      if (incidentsRes.status === 'fulfilled') {
        setIncidents(incidentsRes.value);
      } else {
        console.warn('Failed to fetch incidents:', incidentsRes.reason);
      }

      if (metricsRes.status === 'rejected' && incidentsRes.status === 'rejected') {
        setFetchError('Unable to connect to TracePulse Gateway (Port 4000). Ensure the backend is running.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 20000);
    return () => clearInterval(interval);
  }, []);

  // Compute Global Aggregates
  const totalSpans = services.reduce(
    (sum, s) => sum + (s.total_spans ?? s.totalSpans ?? 0),
    0,
  );
  const totalErrorSpans = services.reduce(
    (sum, s) => sum + (s.error_spans ?? s.errorSpans ?? 0),
    0,
  );
  const globalErrorRate =
    totalSpans > 0 ? (totalErrorSpans / totalSpans) * 100 : 0;
  const globalRpm = Math.round(totalSpans / 5);

  const maxP99 = Math.max(
    ...services.map((s) => s.p99_latency_ms ?? s.p99LatencyMs ?? 0),
    0,
  );
  const maxP95 = Math.max(
    ...services.map((s) => s.p95_latency_ms ?? s.p95LatencyMs ?? 0),
    0,
  );
  const avgP50 =
    services.length > 0
      ? services.reduce(
          (sum, s) => sum + (s.p50_latency_ms ?? s.p50LatencyMs ?? 0),
          0,
        ) / services.length
      : 0;

  const handleSelectTrace = (traceId: string) => {
    setSelectedTraceId(traceId);
    setActiveTab('traces');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openIncidentsCount = incidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING',
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-gray-200">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={() => fetchData(true)}
        isRefreshing={isRefreshing}
      />

      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        {fetchError && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="text-xs font-semibold underline text-white hover:text-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* =========================================================================
            TAB 1: SYSTEM OVERVIEW
           ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in-50 duration-200">
            {/* Hero Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-800/80">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                  Distributed Telemetry Overview
                  {openIncidentsCount > 0 && (
                    <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-400 border border-rose-500/30 animate-pulse">
                      {openIncidentsCount} Active Incident{openIncidentsCount > 1 ? 's' : ''}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  High-throughput OTLP ingestion, ClickHouse columnar aggregates, and real-time anomaly detection.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('traces')}
                  leftIcon={<Layers className="h-3.5 w-3.5 text-blue-400" />}
                >
                  Trace Explorer
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveTab('incidents')}
                  leftIcon={<ShieldAlert className="h-3.5 w-3.5 text-rose-400" />}
                >
                  Incident Center ({openIncidentsCount})
                </Button>
              </div>
            </div>

            {/* Top Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricStatCard
                title="Global Throughput"
                value={`${formatNumber(globalRpm)} RPM`}
                subtitle={`${totalSpans.toLocaleString()} spans in moving 5m window`}
                icon={Gauge}
                iconColor="text-blue-400"
                trend={{
                  label: 'Real-time',
                  isNeutral: true,
                }}
              />

              <MetricStatCard
                title="Overall Error Rate"
                value={formatPercent(globalErrorRate)}
                subtitle={`${totalErrorSpans} failing spans recorded`}
                icon={AlertTriangle}
                iconColor={globalErrorRate >= 5.0 ? 'text-rose-400' : 'text-emerald-400'}
                status={globalErrorRate >= 5.0 ? 'critical' : 'normal'}
                trend={{
                  label: globalErrorRate >= 5.0 ? 'Breached (5% max)' : 'Healthy',
                  isPositive: globalErrorRate < 5.0,
                }}
              />

              <MetricStatCard
                title="Tail Latency (P99)"
                value={formatMs(maxP99)}
                subtitle="Slowest microservice percentile"
                icon={Clock}
                iconColor={maxP99 >= 2000 ? 'text-rose-400' : 'text-amber-400'}
                status={maxP99 >= 2000 ? 'critical' : 'normal'}
                trend={{
                  label: maxP99 >= 2000 ? '> 2000ms SLA' : 'Within SLA',
                  isPositive: maxP99 < 2000,
                }}
              />

              <MetricStatCard
                title="Median Latency (P50)"
                value={formatMs(avgP50)}
                subtitle={`P95: ${formatMs(maxP95)} across services`}
                icon={Activity}
                iconColor="text-purple-400"
                trend={{
                  label: 'Optimal',
                  isPositive: true,
                }}
              />
            </div>

            {/* Per-Service Health Breakdown Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <Server className="h-4 w-4 text-blue-400" />
                    Microservice Health &amp; Anomaly Metrics
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Live throughput, error spikes, and P99 tail latency from ClickHouse MergeTree
                  </p>
                </div>
              </div>

              <ServiceHealthCards
                services={services}
                onSelectTrace={handleSelectTrace}
              />
            </div>

            {/* Latency Percentiles & Intensity Charts */}
            <LatencyCharts services={services} />

            {/* System Architecture Blueprint Card */}
            <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/40 p-6">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-blue-400" />
                Pipeline Infrastructure Architecture
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 space-y-1">
                  <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5" /> Fastify OTLP Gateway
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    Sub-15ms roundtrip ingestion on port 4000 buffering spans into Redis Streams with approximate trimming.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 space-y-1">
                  <div className="font-semibold text-purple-400 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" /> ClickHouse 24.3 MergeTree
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    Partitioned columnar storage computing P50/P95/P99 latency quantiles and error rates across millions of spans.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-gray-900/60 border border-gray-800 space-y-1">
                  <div className="font-semibold text-rose-400 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" /> AI Root Cause Engine
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    Evaluates anomaly spikes every 30s, reconstructs $O(N)$ span trees, and prompts Gemini for incident post-mortems.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: INCIDENT POST-MORTEM CENTER
           ========================================================================= */}
        {activeTab === 'incidents' && (
          <div className="animate-in fade-in-50 duration-200">
            <IncidentList
              incidents={incidents}
              onRefresh={() => fetchData(true)}
              onViewTrace={handleSelectTrace}
            />
          </div>
        )}

        {/* =========================================================================
            TAB 3: TRACE EXPLORER & GANTT WATERFALL
           ========================================================================= */}
        {activeTab === 'traces' && (
          <div className="animate-in fade-in-50 duration-200">
            <TraceExplorer
              initialTraceId={selectedTraceId}
              onSelectTraceId={setSelectedTraceId}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-gray-400 text-xs">
          Loading TracePulse Telemetry Dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
