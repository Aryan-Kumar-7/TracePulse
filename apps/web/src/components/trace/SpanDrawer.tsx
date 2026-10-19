'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Database,
  Globe,
  Layers,
  Server,
  Terminal,
  Zap,
} from 'lucide-react';
import type { SpanTreeNode, CriticalFailurePath } from '@/lib/types';
import { formatDateTime, formatMs, cn } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/Badge';

export interface SpanDrawerProps {
  span: SpanTreeNode | null;
  traceDurationMs: number;
  criticalPath?: CriticalFailurePath | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SpanDrawer({
  span,
  traceDurationMs,
  criticalPath,
  isOpen,
  onClose,
}: SpanDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'attributes' | 'events' | 'raw'>('overview');
  const [attrFilter, setAttrFilter] = useState('');
  const [copied, setCopied] = useState(false);

  if (!span) return null;

  const isRootCause =
    criticalPath?.rootFailingSpan?.spanId === span.spanId;
  const isOnCriticalPath =
    criticalPath?.path?.some((p) => p.spanId === span.spanId) ?? false;
  const isError = span.statusCode === 'ERROR' || span.isFailing;
  const isSlow = span.durationMs > 500;

  const durationPct =
    traceDurationMs > 0
      ? Math.min((span.durationMs / traceDurationMs) * 100, 100).toFixed(1)
      : '0';

  const attributesList = Object.entries(span.attributes || {}).filter(
    ([k, v]) => {
      if (!attrFilter.trim()) return true;
      const q = attrFilter.toLowerCase();
      return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
    },
  );

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(span, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      width="xl"
      title={
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border text-white',
              isError
                ? 'bg-rose-600/20 border-rose-500/40 text-rose-400'
                : isSlow
                  ? 'bg-amber-600/20 border-amber-500/40 text-amber-400'
                  : 'bg-blue-600/20 border-blue-500/40 text-blue-400',
            )}
          >
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight truncate max-w-sm">
                {span.name}
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                  isError
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
                )}
              >
                {span.statusCode}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Service: <span className="text-blue-300">{span.serviceName}</span>
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Critical Failure Path Alert Banner */}
        {isRootCause && (
          <div className="p-3.5 rounded-xl bg-rose-600/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Identified Root Cause Failure Span:</span>
              <p className="mt-0.5 text-gray-300">
                This span initiated the cascading failure across downstream services.
                {criticalPath?.failureType && ` Classification: ${criticalPath.failureType}.`}
              </p>
            </div>
          </div>
        )}

        {!isRootCause && isOnCriticalPath && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This span is on the critical failure propagation path.</span>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex items-center gap-1 border-b border-gray-800 pb-2">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'attributes', label: `Attributes (${Object.keys(span.attributes || {}).length})` },
              { id: 'events', label: `Events (${span.events?.length || 0})` },
              { id: 'raw', label: 'Raw JSON' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 uppercase font-semibold text-[10px]">
                  Duration
                </span>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  {formatMs(span.durationMs)}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {durationPct}% of total trace
                </div>
              </div>

              <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 uppercase font-semibold text-[10px]">
                  Span Kind
                </span>
                <div className="text-sm font-mono font-bold text-white mt-0.5">
                  {span.kind || 'INTERNAL'}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Tree Depth: Level {span.depth}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 uppercase font-semibold text-[10px]">
                  Span ID
                </span>
                <div className="text-xs font-mono text-gray-300 mt-1 truncate">
                  {span.spanId}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 uppercase font-semibold text-[10px]">
                  Parent Span ID
                </span>
                <div className="text-xs font-mono text-gray-300 mt-1 truncate">
                  {span.parentSpanId || 'None (Root Span)'}
                </div>
              </div>
            </div>

            {/* Error Message if present */}
            {(span.statusMessage || span.attributes['exception.message']) && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs">
                <span className="font-semibold text-rose-300 uppercase tracking-wider text-[10px]">
                  Error Message / Exception:
                </span>
                <pre className="mt-1 font-mono text-xs text-rose-200 whitespace-pre-wrap break-all">
                  {span.statusMessage || span.attributes['exception.message']}
                </pre>
              </div>
            )}

            {/* Key Attributes Quick Glance */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold uppercase text-gray-400">
                Key Telemetry Attributes
              </span>
              <div className="divide-y divide-gray-800/80 rounded-xl border border-gray-800 bg-gray-900/40 text-xs">
                {span.attributes['http.method'] && (
                  <div className="flex justify-between p-2.5">
                    <span className="text-gray-400">HTTP Method & Route</span>
                    <span className="font-mono text-blue-300">
                      {span.attributes['http.method']} {span.attributes['http.route'] || span.attributes['http.url']}
                    </span>
                  </div>
                )}
                {span.attributes['http.status_code'] && (
                  <div className="flex justify-between p-2.5">
                    <span className="text-gray-400">HTTP Status Code</span>
                    <span className="font-mono text-rose-300 font-bold">
                      {span.attributes['http.status_code']}
                    </span>
                  </div>
                )}
                {span.attributes['db.system'] && (
                  <div className="flex justify-between p-2.5">
                    <span className="text-gray-400">Database System</span>
                    <span className="font-mono text-purple-300">
                      {span.attributes['db.system']} ({span.attributes['db.name'] || 'db'})
                    </span>
                  </div>
                )}
                {span.attributes['db.statement'] && (
                  <div className="p-2.5">
                    <span className="text-gray-400 block mb-1">SQL Statement</span>
                    <code className="font-mono text-[11px] text-amber-300 bg-black/40 p-2 rounded block whitespace-pre-wrap break-all">
                      {span.attributes['db.statement']}
                    </code>
                  </div>
                )}
                {span.attributes['host.name'] && (
                  <div className="flex justify-between p-2.5">
                    <span className="text-gray-400">Host / Pod</span>
                    <span className="font-mono text-gray-300">
                      {span.attributes['host.name']}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ATTRIBUTES */}
        {activeTab === 'attributes' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Filter attributes by key or value..."
              value={attrFilter}
              onChange={(e) => setAttrFilter(e.target.value)}
              className="w-full rounded-lg bg-gray-900/80 border border-gray-800 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />

            <div className="rounded-xl border border-gray-800 bg-[#070b14] overflow-hidden divide-y divide-gray-800/80 text-xs">
              {attributesList.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No attributes found.
                </div>
              ) : (
                attributesList.map(([key, val]) => (
                  <div
                    key={key}
                    className="p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 hover:bg-gray-900/40"
                  >
                    <span className="font-mono text-blue-400 font-medium select-all">
                      {key}
                    </span>
                    <span className="font-mono text-gray-300 select-all break-all sm:text-right max-w-sm">
                      {String(val)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: EVENTS */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            {(!span.events || span.events.length === 0) ? (
              <div className="p-8 text-center text-gray-500 text-xs italic">
                No events or exceptions attached to this span.
              </div>
            ) : (
              span.events.map((ev, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-800 bg-[#070b14] p-4 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {ev.name}
                    </span>
                    <span className="font-mono text-[10px] text-gray-500">
                      {ev.time}
                    </span>
                  </div>
                  {ev.attributes && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(ev.attributes).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="font-mono text-gray-400">{k}:</span>
                          <span className="font-mono text-gray-200 break-all">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: RAW JSON */}
        {activeTab === 'raw' && (
          <div className="relative">
            <button
              onClick={copyJson}
              className="absolute right-3 top-3 flex items-center gap-1 px-2 py-1 rounded bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-[11px]"
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <pre className="p-4 rounded-xl border border-gray-800 bg-[#070b14] text-xs font-mono text-gray-300 overflow-x-auto max-h-[500px]">
              {JSON.stringify(span, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  );
}
