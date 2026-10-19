import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  REDIS_STREAMS,
  REDIS_CONSUMER_GROUPS,
  TraceStreamPayload,
} from '@tracepulse/shared';
import { RedisService } from '../redis/redis.service';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import { SpanBuffer } from './span-buffer';
import { mapSpanToClickHouseRow } from './clickhouse-formatter';

@Injectable()
export class ClickHouseBatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickHouseBatchService.name);

  private readonly streamKey: string;
  private readonly consumerGroup: string;
  private readonly consumerName: string;

  private readonly spanBuffer: SpanBuffer;
  private isRunning = false;
  private isFlushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly clickhouseService: ClickHouseService,
    private readonly configService: ConfigService,
  ) {
    this.streamKey =
      this.configService.get<string>('redis.streamKey') || REDIS_STREAMS.TRACES;
    this.consumerGroup = REDIS_CONSUMER_GROUPS.BATCH_WRITER;
    this.consumerName = `batch-worker-${uuidv4().slice(0, 8)}`;

    this.spanBuffer = new SpanBuffer({
      maxBatchSize: 1000,
      maxFlushIntervalMs: 1000,
    });
  }

  async onModuleInit() {
    this.logger.log(
      `Initializing ClickHouse batch consumer (group: ${this.consumerGroup}, consumer: ${this.consumerName})`,
    );

    await this.initConsumerGroup();

    this.isRunning = true;
    this.startConsumerLoop();
    this.startPeriodicFlushTicker();
  }

  async onModuleDestroy() {
    this.logger.log('Stopping ClickHouse batch consumer gracefully...');
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.loopPromise) {
      await this.loopPromise.catch((err) =>
        this.logger.warn(`Error awaiting loop shutdown: ${err?.message || err}`),
      );
    }

    // Flush any remaining buffered items before shutdown
    await this.flushBuffer();
    this.logger.log('ClickHouse batch consumer stopped successfully.');
  }

  /**
   * Ensures the Redis Consumer Group exists for trace ingestion.
   */
  private async initConsumerGroup(): Promise<void> {
    const redis = this.redisService.getClient();
    try {
      // XGROUP CREATE streamKey groupName 0 MKSTREAM
      await redis.xgroup(
        'CREATE',
        this.streamKey,
        this.consumerGroup,
        '0',
        'MKSTREAM',
      );
      this.logger.log(
        `Created Redis consumer group "${this.consumerGroup}" on stream "${this.streamKey}"`,
      );
    } catch (err: any) {
      // BUSYGROUP Consumer Group name already exists is expected on restarts
      if (err?.message?.includes('BUSYGROUP')) {
        this.logger.log(
          `Redis consumer group "${this.consumerGroup}" already exists.`,
        );
      } else {
        this.logger.error(
          `Failed to initialize Redis consumer group: ${err?.message || err}`,
          err?.stack,
        );
      }
    }
  }

  /**
   * Ticker that periodically checks if the buffer should be flushed by elapsed time.
   */
  private startPeriodicFlushTicker(): void {
    this.flushTimer = setInterval(async () => {
      if (!this.isRunning) return;

      if (this.spanBuffer.shouldFlush()) {
        await this.flushBuffer();
      }
    }, 250);
  }

  /**
   * Main consumption loop using Redis XREADGROUP.
   */
  private startConsumerLoop(): void {
    this.loopPromise = (async () => {
      const redis = this.redisService.getClient();

      // First, read any pending unacknowledged messages assigned to this group (ID: 0)
      await this.readFromStream('0', 100);

      // Next, continuously read new incoming messages (ID: >)
      while (this.isRunning) {
        try {
          await this.readFromStream('>', 200);

          if (this.spanBuffer.shouldFlush()) {
            await this.flushBuffer();
          }
        } catch (err: any) {
          if (!this.isRunning) break;
          this.logger.error(
            `Error in consumer loop: ${err?.message || err}`,
            err?.stack,
          );
          // Wait briefly before retrying to prevent busy failure loops
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
  }

  /**
   * Reads a batch of messages from the stream and adds to the micro-batch buffer.
   */
  private async readFromStream(id: string, count: number): Promise<void> {
    const redis = this.redisService.getClient();

    // XREADGROUP GROUP group consumer [COUNT count] [BLOCK ms] STREAMS key id
    // Blocking for 1000ms allows timely wakeups when idle
    const response = (await redis.xreadgroup(
      'GROUP',
      this.consumerGroup,
      this.consumerName,
      'COUNT',
      count,
      'BLOCK',
      1000,
      'STREAMS',
      this.streamKey,
      id,
    )) as Array<[string, Array<[string, string[]]>]> | null;

    if (!response || !Array.isArray(response) || response.length === 0) {
      return;
    }

    for (const [_stream, messages] of response) {
      for (const [messageId, fields] of messages) {
        this.processStreamMessage(messageId, fields);
      }
    }

    // If buffer capacity is reached, flush immediately without waiting for ticker
    if (this.spanBuffer.shouldFlush()) {
      await this.flushBuffer();
    }
  }

  /**
   * Deserializes stream fields into trace payload and pushes spans into buffer.
   */
  private processStreamMessage(messageId: string, fields: string[]): void {
    let payloadStr: string | null = null;

    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === 'payload') {
        payloadStr = fields[i + 1];
        break;
      }
    }

    if (!payloadStr) return;

    try {
      const payload: TraceStreamPayload = JSON.parse(payloadStr);
      if (payload?.spans && Array.isArray(payload.spans)) {
        this.spanBuffer.add(payload.spans, messageId);
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to parse stream message ${messageId}: ${err?.message || err}`,
      );
    }
  }

  /**
   * Flushes currently buffered spans to ClickHouse in bulk and acknowledges Redis stream entries upon success.
   */
  async flushBuffer(): Promise<number> {
    if (this.isFlushing || this.spanBuffer.isEmpty()) {
      return 0;
    }

    this.isFlushing = true;
    const { spans, messageIds } = this.spanBuffer.drain();

    if (spans.length === 0) {
      this.isFlushing = false;
      return 0;
    }

    const startTime = performance.now();
    try {
      const rows = spans.map(mapSpanToClickHouseRow);

      // Bulk INSERT into ClickHouse
      await this.clickhouseService.getClient().insert({
        table: 'spans',
        values: rows,
        format: 'JSONEachRow',
      });

      // Confirm at-least-once persistence by acknowledging Redis stream messages
      if (messageIds.length > 0) {
        const redis = this.redisService.getClient();
        await redis.xack(this.streamKey, this.consumerGroup, ...messageIds);
      }

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      this.logger.log(
        `Flushed batch of ${spans.length} spans (${messageIds.length} Redis msgs) to ClickHouse in ${durationMs}ms`,
      );

      return spans.length;
    } catch (err: any) {
      this.logger.error(
        `Failed to flush batch of ${spans.length} spans to ClickHouse: ${err?.message || err}`,
        err?.stack,
      );

      // Put the items back into the buffer so they are not lost
      // Grouping them under their original messageIds
      for (let i = 0; i < spans.length; i++) {
        const msgId = messageIds[Math.min(i, messageIds.length - 1)] || '';
        this.spanBuffer.add([spans[i]], msgId);
      }

      return 0;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Returns current buffer size for metrics / health checks.
   */
  getBufferSize(): number {
    return this.spanBuffer.size();
  }
}
