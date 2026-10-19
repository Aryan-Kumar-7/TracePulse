import { NormalizedSpan } from '@tracepulse/shared';

export interface BufferedItem {
  span: NormalizedSpan;
  messageId: string;
}

export interface DrainResult {
  spans: NormalizedSpan[];
  messageIds: string[];
}

export interface SpanBufferOptions {
  maxBatchSize?: number;
  maxFlushIntervalMs?: number;
}

/**
 * In-memory micro-batch buffer for trace spans.
 * Flushes when reaching `maxBatchSize` (e.g. 1,000 spans)
 * OR when `maxFlushIntervalMs` (e.g. 1,000ms) has elapsed since the first buffered item.
 */
export class SpanBuffer {
  private readonly maxBatchSize: number;
  private readonly maxFlushIntervalMs: number;

  private items: BufferedItem[] = [];
  private firstItemTimestamp: number | null = null;

  constructor(options: SpanBufferOptions = {}) {
    this.maxBatchSize = options.maxBatchSize ?? 1000;
    this.maxFlushIntervalMs = options.maxFlushIntervalMs ?? 1000;
  }

  /**
   * Adds spans associated with a Redis stream message ID to the buffer.
   * Returns true if the buffer has met or exceeded the batch size threshold.
   */
  add(spans: NormalizedSpan[], messageId: string): boolean {
    if (!spans || spans.length === 0) return false;

    if (this.firstItemTimestamp === null) {
      this.firstItemTimestamp = Date.now();
    }

    for (const span of spans) {
      this.items.push({ span, messageId });
    }

    return this.items.length >= this.maxBatchSize;
  }

  /**
   * Checks whether the buffer is ready to flush based on batch count or time interval.
   */
  shouldFlush(): boolean {
    if (this.items.length === 0) {
      return false;
    }

    if (this.items.length >= this.maxBatchSize) {
      return true;
    }

    if (
      this.firstItemTimestamp !== null &&
      Date.now() - this.firstItemTimestamp >= this.maxFlushIntervalMs
    ) {
      return true;
    }

    return false;
  }

  /**
   * Drains all items from the buffer, resetting internal state and timestamps.
   * Deduplicates messageIds so XACK receives unique IDs.
   */
  drain(): DrainResult {
    if (this.items.length === 0) {
      return { spans: [], messageIds: [] };
    }

    const currentItems = this.items;
    this.items = [];
    this.firstItemTimestamp = null;

    const spans: NormalizedSpan[] = [];
    const messageIdSet = new Set<string>();

    for (const item of currentItems) {
      spans.push(item.span);
      if (item.messageId) {
        messageIdSet.add(item.messageId);
      }
    }

    return {
      spans,
      messageIds: Array.from(messageIdSet),
    };
  }

  /**
   * Returns current count of spans in the buffer.
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Returns true if buffer contains zero items.
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clears buffer without returning items.
   */
  clear(): void {
    this.items = [];
    this.firstItemTimestamp = null;
  }
}
