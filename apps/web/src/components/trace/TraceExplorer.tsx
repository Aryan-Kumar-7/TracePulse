'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  History,
  Layers,
  Loader2,
  Play,
  RotateCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { RecentTraceItem, TraceTreeResponse } from '@/lib/types';
import { formatDateTime, formatMs, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TraceWaterfall } from './TraceWaterfall';

export interface TraceExplorerProps {
  initialTraceId?: string | null;
  onSelectTraceId?: (traceId: string) => void;
}

export function TraceExplorer({
  initialTraceId,
  onSelectTraceId,
}: TraceExplorerProps) {
  const [searchInput, setSearchInput] = useState(initialTraceId || '');
  const [activeTraceId, setActiveTraceId] = useState<string | null>(initialTraceId || null);
  const [traceTree, setTraceTree] = useState<TraceTreeResponse | null>(null);
  const [recentTraces, setRecentTraces] = useState<RecentTraceItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load recent traces on mount
  const fetchRecentTraces = async () => {
    try {
      setIsLoadingRecents(true);
      const list = await api.getRecentTraces(15);
      setRecentTraces(list);
    } catch {
      // ignore
    } finally {
      setIsLoadingRecents(false);
    }
  };

  useEffect(() => {
    fetchRecentTraces();
  }, []);

  // Whenever initialTraceId changes externally, load it
  useEffect(() => {
    if (initialTraceId && initialTraceId !== activeTraceId) {
      setSearchInput(initialTraceId);
      loadTrace(initialTraceId);
    }
  }, [initialTraceId]);

  const loadTrace = async (id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setActiveTraceId(cleanId);
      const tree = await api.getTraceTree(cleanId);
      setTraceTree(tree);
      if (onSelectTraceId) {
        onSelectTraceId(cleanId);
      }
    } catch (err: any) {
      setTraceTree(null);
      setErrorMessage(
        err?.message || `Failed to load trace ${cleanId}. Make sure the trace exists in ClickHouse.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      loadTrace(searchInput.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Search Bar */}
      <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/70 p-5 shadow-xl backdrop-blur-sm">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="trace-search"
              className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-2"
            >
              <Search className="h-3.5 w-3.5 text-blue-400" />
              Trace Lookup & Reconstructed Call Hierarchy
            </label>
            <span className="text-[11px] text-gray-500">
              Supports 32-hex or UUID format
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Layers className="absolute left-3.5 top-3 h-4 w-4 text-gray-500" />
              <input
                id="trace-search"
                type="text"
                placeholder="Enter trace ID (e.g. 7a901932-fbf3-e991-d295-9def593942a5)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-xl bg-gray-900/90 border border-gray-800 pl-10 pr-4 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full sm:w-auto"
              leftIcon={<Search className="h-4 w-4" />}
            >
              Fetch Trace Tree
            </Button>
          </div>
        </form>

        {/* Quick-Select Recent Traces Chips */}
        {recentTraces.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5">
                <History className="h-3 w-3 text-purple-400" />
                Recently Ingested Traces (ClickHouse):
              </span>
              <button
                onClick={fetchRecentTraces}
                className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
                title="Refresh recent traces"
              >
                <RotateCw className={cn('h-2.5 w-2.5', isLoadingRecents && 'animate-spin')} />
                Refresh
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {recentTraces.map((tr) => {
                const isSelected = activeTraceId === tr.traceId;
                const isError = tr.statusCode === 'ERROR';

                return (
                  <button
                    key={tr.traceId}
                    onClick={() => {
                      setSearchInput(tr.traceId);
                      loadTrace(tr.traceId);
                    }}
                    className={cn(
                      'shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-500/20 text-white font-semibold shadow-sm'
                        : isError
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                          : 'border-gray-800 bg-gray-900/60 text-gray-300 hover:bg-gray-800 hover:text-white',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isError ? 'bg-rose-400' : 'bg-emerald-400',
                      )}
                    />
                    <span className="font-sans font-semibold text-[11px]">
                      {tr.rootService}
                    </span>
                    <span className="text-gray-500 text-[10px]">
                      {formatMs(tr.durationMs)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-xs text-rose-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Trace Not Found or Query Failed</span>
            <p className="mt-1 text-gray-300">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Active Trace Tree View */}
      {isLoading ? (
        <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/40 p-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-white">
            Reconstructing Trace Call Hierarchy...
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            Traversing parent-child span edges and synthesizing critical failure path in $O(N)$
          </p>
        </div>
      ) : traceTree ? (
        <div className="space-y-4">
          {/* Trace Summary Bar */}
          <div className="rounded-xl border border-gray-800 bg-[#0c1222] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-gray-400">Trace:</span>
              <code className="px-2 py-0.5 rounded bg-gray-900 border border-gray-800 text-xs font-mono text-blue-300 select-all">
                {traceTree.traceId}
              </code>
              {traceTree.hasErrors ? (
                <Badge variant="danger" size="xs" pulse>
                  ERROR DETECTED
                </Badge>
              ) : (
                <Badge variant="success" size="xs">
                  SUCCESSFUL TRACE
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-300">
              <div>
                Spans: <strong className="text-white">{traceTree.totalSpans}</strong>
              </div>
              <div>
                Duration:{' '}
                <strong className="text-white font-mono">
                  {formatMs(traceTree.durationMs)}
                </strong>
              </div>
              <div className="hidden sm:block">
                Services:{' '}
                <strong className="text-white">{traceTree.services.join(', ')}</strong>
              </div>
            </div>
          </div>

          {/* Interactive Gantt Waterfall */}
          <TraceWaterfall tree={traceTree} />
        </div>
      ) : !errorMessage ? (
        <div className="rounded-2xl border border-gray-800 bg-[#0f172a]/40 p-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-400 mb-3">
            <Layers className="h-6 w-6 text-gray-400" />
          </div>
          <h4 className="text-sm font-semibold text-white">Select or Enter a Trace ID</h4>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Click on one of the recent traces above, or paste any UUID from your monitored microservices to render the flame-graph waterfall.
          </p>
        </div>
      ) : null}
    </div>
  );
}
