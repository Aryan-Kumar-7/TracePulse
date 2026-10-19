'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { Incident, IncidentStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { formatDateTime, formatMs, formatPercent, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { SeverityBadge, IncidentStatusBadge } from '@/components/ui/Badge';
import { IncidentDetailModal } from './IncidentDetailModal';

export interface IncidentListProps {
  incidents: Incident[];
  onRefresh?: () => void;
  onViewTrace?: (traceId: string) => void;
}

export function IncidentList({
  incidents,
  onRefresh,
  onViewTrace,
}: IncidentListProps) {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const handleRunScan = async () => {
    try {
      setIsScanning(true);
      setScanMessage(null);
      const res = await api.triggerAnomalyCheck();
      setScanMessage(
        `Scan complete: Evaluated ${res.evaluatedServices} services. ${res.anomaliesBreached} anomalies breached.`,
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setScanMessage(`Scan error: ${err?.message || err}`);
    } finally {
      setIsScanning(false);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        inc.serviceName.toLowerCase().includes(q) ||
        inc.summary.toLowerCase().includes(q) ||
        (inc.traceId && inc.traceId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            AI Incident Post-Mortem Center
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Automated anomaly-triggered outages, root-cause trees, and Gemini-synthesized post-mortems
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            isLoading={isScanning}
            onClick={handleRunScan}
            leftIcon={<Play className="h-3.5 w-3.5 fill-current" />}
          >
            {isScanning ? 'Evaluating...' : 'Run Anomaly Scan'}
          </Button>
        </div>
      </div>

      {scanMessage && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center justify-between">
          <span>{scanMessage}</span>
          <button
            onClick={() => setScanMessage(null)}
            className="text-blue-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#0f172a]/70 border border-gray-800">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED'] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                  statusFilter === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
                )}
              >
                {status}
              </button>
            ),
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search service, summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-gray-900/80 border border-gray-800 pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Incidents Table / Cards */}
      {filteredIncidents.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/40 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-400 mb-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <h4 className="text-sm font-semibold text-white">
            {incidents.length === 0
              ? 'No Incidents Recorded'
              : 'No Incidents Matching Filter'}
          </h4>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            {incidents.length === 0
              ? 'Click "Run Anomaly Scan" or trigger chaos traffic to evaluate service anomalies.'
              : 'Try selecting "ALL" or adjusting your search term.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => {
            const isP1 =
              incident.summary.includes('P1') || incident.errorRate >= 20;

            return (
              <div
                key={incident.id}
                className="group relative rounded-xl border border-gray-800/80 bg-[#0f172a]/60 hover:bg-[#0f172a] hover:border-gray-700/80 p-5 transition-all duration-150 backdrop-blur-sm"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={isP1 ? 'P1' : 'P2'} />
                      <IncidentStatusBadge status={incident.status} />
                      <span className="font-bold text-white text-base">
                        {incident.serviceName}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        • {timeAgo(incident.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300 line-clamp-2 pr-4 leading-relaxed">
                      {incident.summary}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-1">
                      <div>
                        Error Rate:{' '}
                        <span className="font-mono font-semibold text-rose-400">
                          {formatPercent(incident.errorRate)}
                        </span>
                      </div>
                      <div>
                        P99 Latency:{' '}
                        <span className="font-mono font-semibold text-amber-400">
                          {formatMs(incident.p99LatencyMs)}
                        </span>
                      </div>
                      {incident.traceId && (
                        <div className="font-mono text-[11px] text-gray-500">
                          Trace: {incident.traceId.slice(0, 18)}...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-800/80">
                    {incident.traceId && onViewTrace && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewTrace(incident.traceId!)}
                        leftIcon={<Layers className="h-3.5 w-3.5 text-blue-400" />}
                      >
                        Trace
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedIncident(incident)}
                      leftIcon={<Sparkles className="h-3.5 w-3.5 text-amber-400" />}
                      rightIcon={<ArrowRight className="h-3.5 w-3.5 text-gray-400" />}
                    >
                      View Post-Mortem
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Incident Post-Mortem Detail Modal */}
      <IncidentDetailModal
        incident={selectedIncident}
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onViewTrace={onViewTrace}
        onIncidentUpdated={(updated) => {
          setSelectedIncident(updated);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
