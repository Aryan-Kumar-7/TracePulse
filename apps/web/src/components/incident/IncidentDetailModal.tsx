'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { Incident } from '@/lib/types';
import { api } from '@/lib/api';
import { formatDateTime, formatMs, formatPercent, timeAgo } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SeverityBadge, IncidentStatusBadge } from '@/components/ui/Badge';
import { MarkdownPostMortem } from './MarkdownPostMortem';

export interface IncidentDetailModalProps {
  incident: Incident | null;
  isOpen: boolean;
  onClose: () => void;
  onViewTrace?: (traceId: string) => void;
  onIncidentUpdated?: (updated: Incident) => void;
}

export function IncidentDetailModal({
  incident,
  isOpen,
  onClose,
  onViewTrace,
  onIncidentUpdated,
}: IncidentDetailModalProps) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!incident) return null;

  const handleReDiagnose = async () => {
    try {
      setIsDiagnosing(true);
      setErrorMsg(null);
      const updated = await api.diagnoseIncident(incident.id, incident.traceId || undefined);
      if (onIncidentUpdated) {
        onIncidentUpdated(updated);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to re-diagnose incident with AI.');
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white tracking-tight">
                {incident.serviceName} Incident Report
              </span>
              <SeverityBadge
                severity={
                  incident.summary.includes('P1')
                    ? 'P1'
                    : incident.errorRate > 20
                      ? 'P1'
                      : 'P2'
                }
              />
              <IncidentStatusBadge status={incident.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              ID: {incident.id}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Metric Highlights Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-gray-900/60 border border-gray-800">
          <div>
            <div className="text-[10px] uppercase font-semibold text-gray-500">
              Error Rate Spike
            </div>
            <div className="text-base font-mono font-bold text-rose-400 mt-0.5">
              {formatPercent(incident.errorRate)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-gray-500">
              P99 Tail Latency
            </div>
            <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
              {formatMs(incident.p99LatencyMs)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-gray-500">
              First Detected
            </div>
            <div className="text-xs text-gray-300 mt-1">
              {timeAgo(incident.createdAt)} ({formatDateTime(incident.createdAt)})
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-gray-500">
              Target Project
            </div>
            <div className="text-xs text-blue-400 font-medium mt-1">
              {incident.project?.name || 'TracePulse Core'}
            </div>
          </div>
        </div>

        {/* Action Header: Re-Diagnose & Open Trace */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Bot className="h-4 w-4 text-purple-400" />
            <span>Automated AI Synthesis (Gemini / Heuristic Engine)</span>
          </div>

          <div className="flex items-center gap-2">
            {incident.traceId && onViewTrace && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onViewTrace(incident.traceId!);
                }}
                leftIcon={<Layers className="h-3.5 w-3.5 text-blue-400" />}
                rightIcon={<ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />}
              >
                Inspect Failing Trace
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              isLoading={isDiagnosing}
              onClick={handleReDiagnose}
              leftIcon={<Sparkles className="h-3.5 w-3.5 text-amber-300" />}
            >
              {isDiagnosing ? 'Re-Synthesizing...' : 'Re-Diagnose with AI'}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* AI Markdown Report Content */}
        <div className="rounded-xl border border-gray-800/80 bg-[#090d16]/70 p-6 min-h-[300px]">
          <MarkdownPostMortem content={incident.rootCauseMarkdown || ''} />
        </div>
      </div>
    </Modal>
  );
}
