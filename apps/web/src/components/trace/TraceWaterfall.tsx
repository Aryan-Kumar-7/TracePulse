'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  Info,
  Layers,
  Server,
  Zap,
} from 'lucide-react';
import type {
  SpanTreeNode,
  CriticalFailurePath,
  TraceTreeResponse,
} from '@/lib/types';
import { formatMs, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { SpanDrawer } from './SpanDrawer';

export interface TraceWaterfallProps {
  tree: TraceTreeResponse;
}

interface FlattenedSpanItem {
  node: SpanTreeNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  offsetMs: number;
  durationMs: number;
  leftPct: number;
  widthPct: number;
  isRootCause: boolean;
  isOnCriticalPath: boolean;
}

export function TraceWaterfall({ tree }: TraceWaterfallProps) {
  // State for expanded node IDs (default: all expanded)
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(() => {
    const allIds = new Set<string>();
    const collect = (nodes: SpanTreeNode[]) => {
      for (const n of nodes) {
        allIds.add(n.spanId);
        if (n.children && n.children.length > 0) {
          collect(n.children);
        }
      }
    };
    collect(tree.rootNodes || []);
    return allIds;
  });

  const [selectedSpan, setSelectedSpan] = useState<SpanTreeNode | null>(null);

  // Set of span IDs on the critical failure path
  const rootCauseSpanId = tree.criticalPath?.rootFailingSpan?.spanId;
  const criticalPathSpanIds = useMemo(() => {
    const set = new Set<string>();
    if (tree.criticalPath?.path) {
      for (const s of tree.criticalPath.path) {
        set.add(s.spanId);
      }
    }
    return set;
  }, [tree.criticalPath]);

  // Determine trace start reference (earliest start time)
  const earliestTimeMs = useMemo(() => {
    let minTime = Infinity;
    const scan = (nodes: SpanTreeNode[]) => {
      for (const n of nodes) {
        const t = new Date(n.startTime).getTime();
        if (!isNaN(t) && t < minTime) minTime = t;
        if (n.children) scan(n.children);
      }
    };
    scan(tree.rootNodes || []);
    return minTime === Infinity ? 0 : minTime;
  }, [tree.rootNodes]);

  const totalDurationMs = Math.max(tree.durationMs || 1, 1);

  // Flatten the tree respecting collapsed nodes
  const flattenedSpans = useMemo(() => {
    const items: FlattenedSpanItem[] = [];

    const traverse = (nodes: SpanTreeNode[], depth = 0) => {
      for (const node of nodes) {
        const nodeTime = new Date(node.startTime).getTime();
        const offsetMs =
          !isNaN(nodeTime) && earliestTimeMs > 0
            ? Math.max(0, nodeTime - earliestTimeMs)
            : 0;

        const leftPct = Math.min((offsetMs / totalDurationMs) * 100, 98);
        const rawWidthPct = (node.durationMs / totalDurationMs) * 100;
        // Ensure at least 1.5% width so fast spans are visible
        const widthPct = Math.min(
          Math.max(rawWidthPct, 1.5),
          100 - leftPct,
        );

        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedSpanIds.has(node.spanId);
        const isRootCause = node.spanId === rootCauseSpanId;
        const isOnCriticalPath = criticalPathSpanIds.has(node.spanId);

        items.push({
          node,
          depth,
          hasChildren,
          isExpanded,
          offsetMs,
          durationMs: node.durationMs,
          leftPct,
          widthPct,
          isRootCause,
          isOnCriticalPath,
        });

        if (hasChildren && isExpanded) {
          traverse(node.children, depth + 1);
        }
      }
    };

    traverse(tree.rootNodes || []);
    return items;
  }, [
    tree.rootNodes,
    expandedSpanIds,
    earliestTimeMs,
    totalDurationMs,
    rootCauseSpanId,
    criticalPathSpanIds,
  ]);

  const toggleExpand = (spanId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSpanIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const collect = (nodes: SpanTreeNode[]) => {
      for (const n of nodes) {
        allIds.add(n.spanId);
        if (n.children) collect(n.children);
      }
    };
    collect(tree.rootNodes || []);
    setExpandedSpanIds(allIds);
  };

  const collapseAll = () => {
    setExpandedSpanIds(new Set());
  };

  // Service color map
  const serviceColors = useMemo(() => {
    const colors = [
      'text-blue-400 bg-blue-500/10 border-blue-500/20',
      'text-purple-400 bg-purple-500/10 border-purple-500/20',
      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      'text-amber-400 bg-amber-500/10 border-amber-500/20',
      'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      'text-rose-400 bg-rose-500/10 border-rose-500/20',
    ];
    const map: Record<string, string> = {};
    (tree.services || []).forEach((s, idx) => {
      map[s] = colors[idx % colors.length];
    });
    return map;
  }, [tree.services]);

  return (
    <div className="space-y-4">
      {/* Critical Failure Path Summary Card */}
      {tree.criticalPath?.hasFailure && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-4 sm:p-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    Critical Failure Path Detected
                  </span>
                  <Badge variant="p1" size="xs">
                    {tree.criticalPath.failureType}
                  </Badge>
                </div>
                <p className="text-xs text-rose-300/90 mt-1">
                  Root failure span:{' '}
                  <span className="font-mono font-semibold text-white">
                    [{tree.criticalPath.rootFailingSpan?.serviceName}]{' '}
                    {tree.criticalPath.rootFailingSpan?.name}
                  </span>{' '}
                  propagated through {tree.criticalPath.path.length} microservice
                  hops.
                </p>
                {tree.criticalPath.errorMessage && (
                  <div className="mt-2 text-xs font-mono text-rose-200 bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded-lg max-w-2xl break-all">
                    {tree.criticalPath.errorMessage}
                  </div>
                )}
              </div>
            </div>

            {tree.criticalPath.rootFailingSpan && (
              <button
                onClick={() =>
                  setSelectedSpan(tree.criticalPath.rootFailingSpan)
                }
                className="self-start sm:self-center shrink-0 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition-colors shadow-md shadow-rose-500/20"
              >
                Inspect Root Cause Span
              </button>
            )}
          </div>
        </div>
      )}

      {/* Waterfall Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="font-semibold text-white">
            {flattenedSpans.length} / {tree.totalSpans} Spans Visible
          </span>
          <span>•</span>
          <span>Total Duration: <strong className="text-white font-mono">{formatMs(tree.durationMs)}</strong></span>
          <span>•</span>
          <span>{tree.services.length} Services</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 rounded bg-gray-800/80 hover:bg-gray-800 text-[11px] font-medium text-gray-300 hover:text-white transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 rounded bg-gray-800/80 hover:bg-gray-800 text-[11px] font-medium text-gray-300 hover:text-white transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Main Gantt Timeline Container */}
      <div className="rounded-2xl border border-gray-800 bg-[#070b14] overflow-hidden shadow-2xl">
        {/* Timeline Header Ruler */}
        <div className="grid grid-cols-12 border-b border-gray-800 bg-[#0c1222] text-[11px] font-mono text-gray-400 select-none">
          {/* Left Column: Span Tree Hierarchy Label */}
          <div className="col-span-12 md:col-span-5 px-4 py-3 font-semibold text-gray-300 border-r border-gray-800 flex items-center justify-between">
            <span>SERVICE / SPAN HIERARCHY</span>
            <span className="text-[10px] text-gray-500 font-normal">DURATION</span>
          </div>

          {/* Right Column: Timeline Millisecond Scale */}
          <div className="hidden md:flex col-span-7 items-center justify-between px-4 py-3 relative">
            <span className="text-gray-500">0ms</span>
            <span className="text-gray-500">
              {formatMs(totalDurationMs * 0.25)}
            </span>
            <span className="text-gray-500">
              {formatMs(totalDurationMs * 0.5)}
            </span>
            <span className="text-gray-500">
              {formatMs(totalDurationMs * 0.75)}
            </span>
            <span className="text-blue-400 font-bold">
              {formatMs(totalDurationMs)}
            </span>
          </div>
        </div>

        {/* Span Rows */}
        <div className="divide-y divide-gray-800/60 relative">
          {flattenedSpans.map((item) => {
            const {
              node,
              depth,
              hasChildren,
              isExpanded,
              leftPct,
              widthPct,
              isRootCause,
              isOnCriticalPath,
            } = item;

            const isError = node.statusCode === 'ERROR' || node.isFailing;
            const isSlow = node.durationMs > 500;
            const serviceBadgeClass =
              serviceColors[node.serviceName] ||
              'text-gray-300 bg-gray-800 border-gray-700';

            return (
              <div
                key={node.spanId}
                onClick={() => setSelectedSpan(node)}
                className={cn(
                  'grid grid-cols-12 group cursor-pointer transition-colors hover:bg-blue-600/[0.07]',
                  isRootCause && 'bg-rose-600/[0.08]',
                  !isRootCause && isOnCriticalPath && 'bg-amber-500/[0.04]',
                )}
              >
                {/* Left Hierarchy Tree Column */}
                <div className="col-span-12 md:col-span-5 py-2.5 px-4 border-r border-gray-800 flex items-center justify-between gap-2 overflow-hidden">
                  <div
                    className="flex items-center gap-1.5 min-w-0"
                    style={{ paddingLeft: `${depth * 18}px` }}
                  >
                    {/* Expand/Collapse Chevron */}
                    {hasChildren ? (
                      <button
                        onClick={(e) => toggleExpand(node.spanId, e)}
                        className="p-1 -ml-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-4 inline-block" />
                    )}

                    {/* Service Pill Badge */}
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate max-w-[110px]',
                        serviceBadgeClass,
                      )}
                    >
                      {node.serviceName}
                    </span>

                    {/* Span Name */}
                    <span className="text-xs font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                      {node.name}
                    </span>

                    {/* Failure Path Badges */}
                    {isRootCause && (
                      <Badge variant="p1" size="xs">
                        🚨 ROOT CAUSE
                      </Badge>
                    )}
                    {!isRootCause && isOnCriticalPath && (
                      <Badge variant="warning" size="xs">
                        ⚠️ ON PATH
                      </Badge>
                    )}
                  </div>

                  {/* Duration Text */}
                  <span
                    className={cn(
                      'text-xs font-mono font-medium shrink-0 ml-2',
                      isError
                        ? 'text-rose-400'
                        : isSlow
                          ? 'text-amber-400'
                          : 'text-gray-400',
                    )}
                  >
                    {formatMs(node.durationMs)}
                  </span>
                </div>

                {/* Right Gantt Duration Bar Column */}
                <div className="hidden md:flex col-span-7 items-center px-4 py-2 relative">
                  {/* Vertical Guidelines for 25%, 50%, 75% */}
                  <div className="absolute inset-y-0 left-[25%] w-px border-r border-gray-800/40 pointer-events-none" />
                  <div className="absolute inset-y-0 left-[50%] w-px border-r border-gray-800/40 pointer-events-none" />
                  <div className="absolute inset-y-0 left-[75%] w-px border-r border-gray-800/40 pointer-events-none" />

                  {/* Gantt Duration Bar */}
                  <div className="w-full relative h-6 flex items-center">
                    <div
                      className={cn(
                        'absolute h-4 rounded-md shadow-sm transition-all duration-200 group-hover:h-5 flex items-center px-2',
                        isError
                          ? 'bg-gradient-to-r from-rose-600 to-rose-500 shadow-rose-500/20 border border-rose-400/40'
                          : isSlow
                            ? 'bg-gradient-to-r from-amber-600 to-amber-500 shadow-amber-500/20 border border-amber-400/40'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-500 shadow-blue-500/20 border border-blue-400/40',
                      )}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                      title={`${node.serviceName} - ${node.name}: ${formatMs(node.durationMs)} (${node.statusCode})`}
                    >
                      {widthPct > 8 && (
                        <span className="text-[10px] font-mono text-white font-semibold truncate drop-shadow">
                          {formatMs(node.durationMs)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Drawer Inspector */}
      <SpanDrawer
        span={selectedSpan}
        traceDurationMs={tree.durationMs}
        criticalPath={tree.criticalPath}
        isOpen={!!selectedSpan}
        onClose={() => setSelectedSpan(null)}
      />
    </div>
  );
}
