import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpanBuffer } from './span-buffer';
import { NormalizedSpan } from '@tracepulse/shared';

function createMockSpan(spanId: string, name = 'test-span'): NormalizedSpan {
  return {
    traceId: '12345678-1234-1234-1234-123456789012',
    spanId,
    parentSpanId: '',
    serviceName: 'order-service',
    name,
    kind: 'SERVER',
    startTime: '2026-10-18T10:00:00.000Z',
    endTime: '2026-10-18T10:00:00.050Z',
    durationMs: 50,
    statusCode: 'OK',
    statusMessage: '',
    attributes: {},
    events: [],
  };
}

describe('SpanBuffer', () => {
  let buffer: SpanBuffer;

  beforeEach(() => {
    vi.useRealTimers();
    buffer = new SpanBuffer({ maxBatchSize: 5, maxFlushIntervalMs: 500 });
  });

  it('initializes in an empty state', () => {
    expect(buffer.size()).toBe(0);
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.shouldFlush()).toBe(false);
  });

  it('buffers spans and increments size', () => {
    const spans = [createMockSpan('s1'), createMockSpan('s2')];
    const isFull = buffer.add(spans, '1710000000000-0');

    expect(isFull).toBe(false);
    expect(buffer.size()).toBe(2);
    expect(buffer.isEmpty()).toBe(false);
    expect(buffer.shouldFlush()).toBe(false);
  });

  it('triggers flush when batch size threshold is reached', () => {
    const batch1 = [createMockSpan('s1'), createMockSpan('s2'), createMockSpan('s3')];
    const batch2 = [createMockSpan('s4'), createMockSpan('s5')];

    expect(buffer.add(batch1, 'msg-1')).toBe(false);
    expect(buffer.shouldFlush()).toBe(false);

    expect(buffer.add(batch2, 'msg-2')).toBe(true);
    expect(buffer.shouldFlush()).toBe(true);
    expect(buffer.size()).toBe(5);
  });

  it('triggers flush when time threshold has elapsed', () => {
    vi.useFakeTimers();
    const now = 10000;
    vi.setSystemTime(now);

    const timeBuffer = new SpanBuffer({ maxBatchSize: 10, maxFlushIntervalMs: 1000 });
    timeBuffer.add([createMockSpan('s1')], 'msg-1');

    expect(timeBuffer.shouldFlush()).toBe(false);

    // Advance 500ms -> should not flush yet
    vi.advanceTimersByTime(500);
    expect(timeBuffer.shouldFlush()).toBe(false);

    // Advance another 500ms -> 1000ms total, should flush!
    vi.advanceTimersByTime(500);
    expect(timeBuffer.shouldFlush()).toBe(true);
  });

  it('drains spans and deduplicates messageIds', () => {
    const spansA = [createMockSpan('s1'), createMockSpan('s2')];
    const spansB = [createMockSpan('s3')];

    // Same message ID for spansA, different for spansB
    buffer.add(spansA, 'msg-1');
    buffer.add(spansB, 'msg-2');

    const result = buffer.drain();

    expect(result.spans).toHaveLength(3);
    expect(result.messageIds).toEqual(['msg-1', 'msg-2']);
    expect(buffer.size()).toBe(0);
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.shouldFlush()).toBe(false);
  });

  it('returns empty results when draining empty buffer', () => {
    const result = buffer.drain();
    expect(result.spans).toEqual([]);
    expect(result.messageIds).toEqual([]);
  });
});
