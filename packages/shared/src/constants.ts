export const REDIS_STREAMS = {
  TRACES: 'tracepulse:stream:traces',
  DEAD_LETTER: 'tracepulse:stream:traces:dlq',
} as const;

export const REDIS_CONSUMER_GROUPS = {
  BATCH_WRITER: 'tracepulse:cg:batch-writer',
  ANOMALY_DETECTOR: 'tracepulse:cg:anomaly-detector',
} as const;

export const TRACEPULSE_STREAM_MAXLEN = 100_000; // Capped stream to avoid memory exhaustion
