import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import {
  SpanTreeNode,
  SpanTree,
  CriticalFailurePath,
  FailureClassification,
  NormalizedSpan,
} from '@tracepulse/shared';

export interface RawClickHouseSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_name: string;
  name: string;
  kind: string;
  start_time: string;
  end_time: string;
  duration_ms: number | string;
  status_code: string;
  status_message?: string;
  attributes?: Record<string, string>;
  'events_nested.time'?: string[];
  'events_nested.name'?: string[];
  'events_nested.attributes'?: Record<string, string>[];
  [key: string]: any;
}

/**
 * Ensures 32-char hex trace ID is formatted as an RFC 4122 8-4-4-4-12 UUID string
 * so ClickHouse UUID queries match natively.
 */
export function normalizeTraceIdToUuid(id: string): string {
  if (!id) return '00000000-0000-0000-0000-000000000000';
  const clean = id.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').slice(0, 32);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

@Injectable()
export class SpanTreeService {
  private readonly logger = new Logger(SpanTreeService.name);

  constructor(private readonly clickhouseService: ClickHouseService) {}

  /**
   * Queries ClickHouse for all spans belonging to a given trace_id.
   */
  async getTraceSpans(traceId: string): Promise<RawClickHouseSpan[]> {
    const formattedTraceId = normalizeTraceIdToUuid(traceId);

    const query = `
      SELECT
        trace_id,
        span_id,
        parent_span_id,
        service_name,
        name,
        kind,
        start_time,
        end_time,
        duration_ms,
        status_code,
        status_message,
        attributes,
        events_nested.time,
        events_nested.name,
        events_nested.attributes
      FROM default.spans
      WHERE trace_id = {traceId:UUID}
      ORDER BY start_time ASC
    `;

    try {
      const res = await this.clickhouseService.getClient().query({
        query,
        query_params: { traceId: formattedTraceId },
        format: 'JSONEachRow',
      });
      return (await res.json()) as RawClickHouseSpan[];
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch trace spans for traceId ${traceId} (${formattedTraceId}): ${err?.message || err}`,
        err?.stack,
      );
      return [];
    }
  }

  /**
   * Evaluates whether an individual span represents a failure condition.
   */
  isSpanFailing(span: {
    statusCode?: string;
    statusMessage?: string;
    attributes?: Record<string, string>;
  }): boolean {
    const code = (span.statusCode || '').toUpperCase();
    if (code === 'ERROR' || code === '2') {
      return true;
    }

    const attrs = span.attributes || {};
    if (attrs['error'] === 'true' || attrs['error'] === '1') {
      return true;
    }

    if (attrs['exception.type'] || attrs['exception.message']) {
      return true;
    }

    const httpCode = parseInt(
      attrs['http.status_code'] || attrs['http.response_status_code'] || '0',
      10,
    );
    if (httpCode >= 500) {
      return true;
    }

    const msg = (span.statusMessage || '').toLowerCase();
    if (
      msg.includes('exception') ||
      msg.includes('timeout') ||
      msg.includes('error') ||
      msg.includes('fail')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Reconstructs the hierarchical span tree in O(N) time.
   * Handles multi-root traces, orphaned spans, and arbitrary nesting depths.
   */
  buildSpanTree(spans: (RawClickHouseSpan | NormalizedSpan)[]): SpanTree {
    if (!spans || spans.length === 0) {
      return {
        traceId: '',
        rootNodes: [],
        totalSpans: 0,
        services: [],
        durationMs: 0,
        hasErrors: false,
      };
    }

    const traceId = (spans[0] as any).trace_id || (spans[0] as any).traceId || '';
    const nodeMap = new Map<string, SpanTreeNode>();
    const servicesSet = new Set<string>();
    let hasErrors = false;
    let minStartTime = Infinity;
    let maxEndTime = -Infinity;

    // Pass 1: Instantiate all SpanTreeNode objects (O(N))
    for (const raw of spans) {
      const spanId = String((raw as any).span_id || (raw as any).spanId || '');
      const parentSpanId = String(
        (raw as any).parent_span_id || (raw as any).parentSpanId || '',
      );
      const serviceName =
        (raw as any).service_name || (raw as any).serviceName || 'unknown-service';
      const name = (raw as any).name || 'unnamed-span';
      const kind = (raw as any).kind || 'INTERNAL';
      const startTime = String((raw as any).start_time || (raw as any).startTime || '');
      const endTime = String((raw as any).end_time || (raw as any).endTime || startTime);
      const durationMs = Number((raw as any).duration_ms ?? (raw as any).durationMs ?? 0);
      const statusCode = (
        (raw as any).status_code ||
        (raw as any).statusCode ||
        'UNSET'
      ).toUpperCase();
      const statusMessage =
        (raw as any).status_message || (raw as any).statusMessage || '';
      const attributes = (raw as any).attributes || {};

      servicesSet.add(serviceName);

      // Parse timestamps for total trace duration calculation
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      if (!isNaN(startMs) && startMs < minStartTime) minStartTime = startMs;
      if (!isNaN(endMs) && endMs > maxEndTime) maxEndTime = endMs;

      // Extract events if available
      let events: SpanTreeNode['events'] = undefined;
      const nestedTimes = (raw as any)['events_nested.time'] || (raw as any).events;
      if (Array.isArray(nestedTimes)) {
        if (typeof nestedTimes[0] === 'object' && nestedTimes[0]?.name) {
          events = nestedTimes;
        } else {
          const names = (raw as any)['events_nested.name'] || [];
          const attrs = (raw as any)['events_nested.attributes'] || [];
          events = nestedTimes.map((t: string, i: number) => ({
            time: t,
            name: names[i] || '',
            attributes: attrs[i] || {},
          }));
        }
      }

      const failing = this.isSpanFailing({
        statusCode,
        statusMessage,
        attributes,
      });
      if (failing) {
        hasErrors = true;
      }

      const node: SpanTreeNode = {
        spanId,
        parentSpanId,
        traceId: String((raw as any).trace_id || (raw as any).traceId || traceId),
        serviceName,
        name,
        kind,
        startTime,
        endTime,
        durationMs,
        statusCode,
        statusMessage,
        attributes,
        events,
        depth: 0,
        isRoot: false,
        isFailing: failing,
        children: [],
      };

      nodeMap.set(spanId, node);
    }

    const rootNodes: SpanTreeNode[] = [];

    // Pass 2: Connect parent-child references (O(N))
    for (const node of nodeMap.values()) {
      const parentId = node.parentSpanId;
      const hasParent =
        parentId &&
        parentId !== '' &&
        parentId !== '0' &&
        parentId !== '0000000000000000' &&
        nodeMap.has(parentId);

      if (hasParent) {
        const parentNode = nodeMap.get(parentId)!;
        parentNode.children.push(node);
      } else {
        node.isRoot = true;
        rootNodes.push(node);
      }
    }

    // Pass 3: Calculate depth and sort siblings by start time (O(N))
    const visited = new Set<string>();
    const queue: Array<{ node: SpanTreeNode; depth: number }> = rootNodes.map(
      (r) => ({ node: r, depth: 0 }),
    );

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (visited.has(node.spanId)) continue;
      visited.add(node.spanId);

      node.depth = depth;

      // Sort children chronologically
      node.children.sort((a, b) => {
        const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        return isNaN(diff) ? 0 : diff;
      });

      for (const child of node.children) {
        queue.push({ node: child, depth: depth + 1 });
      }
    }

    const calculatedDurationMs =
      maxEndTime > minStartTime && isFinite(minStartTime) && isFinite(maxEndTime)
        ? maxEndTime - minStartTime
        : rootNodes.reduce((acc, r) => Math.max(acc, r.durationMs), 0);

    return {
      traceId,
      rootNodes,
      totalSpans: nodeMap.size,
      services: Array.from(servicesSet),
      durationMs: calculatedDurationMs,
      hasErrors,
    };
  }

  /**
   * Traverses the tree to pinpoint the exact root failing span and the critical failure path.
   * In a cascading failure (e.g. Postgres lock timeout -> Payment 502 -> Order 500 -> Gateway 500),
   * this identifies the deepest origin failing span (Postgres) and the call path leading to it.
   */
  extractCriticalFailurePath(tree: SpanTree): CriticalFailurePath {
    if (!tree || tree.totalSpans === 0 || tree.rootNodes.length === 0) {
      return {
        hasFailure: false,
        rootFailingSpan: null,
        path: [],
        failureType: 'NONE',
        durationMs: 0,
        impactedServices: [],
      };
    }

    // Build span lookup map
    const nodeMap = new Map<string, SpanTreeNode>();
    const allNodes: SpanTreeNode[] = [];
    const traverse = (node: SpanTreeNode) => {
      nodeMap.set(node.spanId, node);
      allNodes.push(node);
      for (const child of node.children) {
        traverse(child);
      }
    };
    for (const root of tree.rootNodes) {
      traverse(root);
    }

    const failingNodes = allNodes.filter((n) => n.isFailing);

    if (failingNodes.length === 0) {
      // No explicit error statuses. Find span with highest self-time (exclusive duration)
      let bottleneckSpan: SpanTreeNode | null = null;
      let maxSelfTime = 0;

      for (const node of allNodes) {
        const childrenDuration = node.children.reduce(
          (sum, c) => sum + (c.durationMs || 0),
          0,
        );
        const selfTime = Math.max(0, node.durationMs - childrenDuration);
        if (selfTime > maxSelfTime) {
          maxSelfTime = selfTime;
          bottleneckSpan = node;
        }
      }

      if (bottleneckSpan && maxSelfTime >= 400) {
        const path = this.buildPathFromRootToSpan(bottleneckSpan, nodeMap);
        return {
          hasFailure: true,
          rootFailingSpan: bottleneckSpan,
          path,
          failureType: 'LATENCY_BOTTLENECK',
          durationMs: bottleneckSpan.durationMs,
          impactedServices: Array.from(new Set(path.map((n) => n.serviceName))),
          errorMessage: `Latency bottleneck detected: span took ${bottleneckSpan.durationMs.toFixed(1)}ms (${maxSelfTime.toFixed(1)}ms exclusive self-time)`,
        };
      }

      return {
        hasFailure: false,
        rootFailingSpan: null,
        path: [],
        failureType: 'NONE',
        durationMs: tree.durationMs,
        impactedServices: [],
      };
    }

    // Find "leaf failure" spans: failing spans that have NO failing children
    // In a distributed error cascade, these are the original points of failure!
    const leafFailures = failingNodes.filter(
      (n) => !n.children.some((c) => c.isFailing),
    );

    // Pick the most indicative root cause:
    // 1. Spans with explicit database/query timeouts or exception attributes
    // 2. Or the earliest start time
    let rootFailingSpan: SpanTreeNode = leafFailures[0] || failingNodes[0];

    for (const candidate of leafFailures) {
      const isDb =
        candidate.attributes['db.system'] ||
        candidate.attributes['exception.type'] ||
        (candidate.statusMessage &&
          candidate.statusMessage.toLowerCase().includes('timeout'));

      const currentIsDb =
        rootFailingSpan.attributes['db.system'] ||
        rootFailingSpan.attributes['exception.type'] ||
        (rootFailingSpan.statusMessage &&
          rootFailingSpan.statusMessage.toLowerCase().includes('timeout'));

      if (isDb && !currentIsDb) {
        rootFailingSpan = candidate;
      } else if (isDb === currentIsDb) {
        const candidateStart = new Date(candidate.startTime).getTime();
        const currentStart = new Date(rootFailingSpan.startTime).getTime();
        if (candidateStart < currentStart) {
          rootFailingSpan = candidate;
        }
      }
    }

    // Reconstruct full call chain from root down to rootFailingSpan
    const path = this.buildPathFromRootToSpan(rootFailingSpan, nodeMap);

    // Classify failure type
    const attrs = rootFailingSpan.attributes || {};
    const statusMsg = rootFailingSpan.statusMessage || '';
    const exceptionType =
      attrs['exception.type'] ||
      (statusMsg.includes(':') ? statusMsg.split(':')[0].trim() : undefined);
    const errorMessage = attrs['exception.message'] || statusMsg || undefined;
    const httpStatusCode = parseInt(
      attrs['http.status_code'] || attrs['http.response_status_code'] || '0',
      10,
    );

    let failureType: FailureClassification = 'UNKNOWN';
    if (
      attrs['db.system'] ||
      statusMsg.toLowerCase().includes('timeout') ||
      statusMsg.toLowerCase().includes('lock') ||
      exceptionType?.toLowerCase().includes('timeout')
    ) {
      failureType = 'DB_TIMEOUT';
    } else if (exceptionType || attrs['exception.message']) {
      failureType = 'EXCEPTION';
    } else if (httpStatusCode >= 500) {
      failureType = 'HTTP_5XX';
    }

    const dbStatement =
      attrs['db.statement'] ||
      (rootFailingSpan.name.startsWith('SELECT') ||
      rootFailingSpan.name.startsWith('INSERT') ||
      rootFailingSpan.name.startsWith('UPDATE') ||
      rootFailingSpan.name.startsWith('DELETE')
        ? rootFailingSpan.name
        : undefined);

    const impactedServices = Array.from(new Set(path.map((n) => n.serviceName)));

    return {
      hasFailure: true,
      rootFailingSpan,
      path,
      failureType,
      errorMessage,
      exceptionType,
      httpStatusCode: httpStatusCode > 0 ? httpStatusCode : undefined,
      dbSystem: attrs['db.system'],
      dbStatement,
      durationMs: rootFailingSpan.durationMs,
      impactedServices,
    };
  }

  /**
   * Helper that climbs parent pointers from a target span up to the root, returning top-to-bottom array.
   */
  private buildPathFromRootToSpan(
    target: SpanTreeNode,
    nodeMap: Map<string, SpanTreeNode>,
  ): SpanTreeNode[] {
    const chain: SpanTreeNode[] = [];
    let current: SpanTreeNode | undefined = target;
    const visited = new Set<string>();

    while (current && !visited.has(current.spanId)) {
      visited.add(current.spanId);
      chain.push(current);

      if (!current.parentSpanId || !nodeMap.has(current.parentSpanId)) {
        break;
      }
      current = nodeMap.get(current.parentSpanId);
    }

    return chain.reverse();
  }

  /**
   * Formats a hierarchical ASCII waterfall representation of the span tree.
   * Visually highlights failing spans and pinpoints the root cause.
   */
  formatSpanTreeAscii(
    tree: SpanTree,
    criticalPath?: CriticalFailurePath,
  ): string {
    if (!tree || tree.rootNodes.length === 0) {
      return '*(No spans found for trace)*';
    }

    const lines: string[] = [];
    const rootCauseSpanId = criticalPath?.rootFailingSpan?.spanId;
    const pathSpanIds = new Set(criticalPath?.path?.map((p) => p.spanId) || []);

    const printNode = (node: SpanTreeNode, prefix: string, isLast: boolean) => {
      const branch = node.depth === 0 ? '' : isLast ? '└── ' : '├── ';
      const statusTag = node.isFailing ? '[ERROR ⚠️]' : '[OK]';
      const rootCauseTag = node.spanId === rootCauseSpanId ? ' 🚨 [ROOT CAUSE]' : '';
      const pathTag =
        node.spanId !== rootCauseSpanId && pathSpanIds.has(node.spanId)
          ? ' ⚠️ [ON FAILURE PATH]'
          : '';

      const httpCode = node.attributes['http.status_code']
        ? ` [HTTP ${node.attributes['http.status_code']}]`
        : '';
      const duration = `${node.durationMs.toFixed(1)}ms`;

      let errorAnnotation = '';
      if (node.statusMessage) {
        errorAnnotation = ` -> "${node.statusMessage}"`;
      } else if (node.attributes['exception.message']) {
        errorAnnotation = ` -> "${node.attributes['exception.message']}"`;
      }

      lines.push(
        `${prefix}${branch}[${node.serviceName}] ${node.name} (${duration}) ${statusTag}${httpCode}${rootCauseTag}${pathTag}${errorAnnotation}`,
      );

      const nextPrefix = prefix + (node.depth === 0 ? '' : isLast ? '    ' : '│   ');
      for (let i = 0; i < node.children.length; i++) {
        const isChildLast = i === node.children.length - 1;
        printNode(node.children[i], nextPrefix, isChildLast);
      }
    };

    for (let i = 0; i < tree.rootNodes.length; i++) {
      const isRootLast = i === tree.rootNodes.length - 1;
      printNode(tree.rootNodes[i], '', isRootLast);
    }

    return lines.join('\n');
  }

  /**
   * Queries ClickHouse for a summary list of the most recent traces.
   */
  async getRecentTraces(limit = 20): Promise<Array<{
    traceId: string;
    rootService: string;
    rootSpanName: string;
    statusCode: string;
    durationMs: number;
    startTime: string;
    spanCount: number;
  }>> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const query = `
      SELECT
        trace_id,
        any(service_name) AS root_service,
        any(name) AS root_name,
        anyIf(status_code, status_code = 'ERROR') AS error_status,
        any(status_code) AS sample_status,
        round(max(duration_ms), 2) AS max_duration_ms,
        min(start_time) AS start_time,
        count() AS span_count
      FROM default.spans
      GROUP BY trace_id
      ORDER BY start_time DESC
      LIMIT ${safeLimit}
    `;

    try {
      const res = await this.clickhouseService.getClient().query({
        query,
        format: 'JSONEachRow',
      });
      const rows = (await res.json()) as any[];
      return rows.map((r) => ({
        traceId: r.trace_id,
        rootService: r.root_service,
        rootSpanName: r.root_name,
        statusCode: r.error_status || r.sample_status || 'OK',
        durationMs: Number(r.max_duration_ms) || 0,
        startTime: r.start_time,
        spanCount: Number(r.span_count) || 0,
      }));
    } catch (err: any) {
      this.logger.error(`Failed to fetch recent traces: ${err?.message || err}`);
      return [];
    }
  }
}
