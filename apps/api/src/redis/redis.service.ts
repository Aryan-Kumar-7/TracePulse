import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TraceStreamPayload, TRACEPULSE_STREAM_MAXLEN } from '@tracepulse/shared';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');

    this.client = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        this.logger.warn(`Redis connection retrying in ${delay}ms... (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.logger.log(`Successfully connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis client disconnected gracefully.');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Health ping
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * High-throughput push to Redis Stream using XADD with approximate trimming (MAXLEN ~ N)
   * This guarantees O(1) time complexity and memory safety without blocking the event loop.
   */
  async xAddStream(
    streamKey: string,
    payload: TraceStreamPayload,
  ): Promise<string> {
    // XADD key MAXLEN ~ 100000 * field1 val1 field2 val2
    const id = await this.client.xadd(
      streamKey,
      'MAXLEN',
      '~',
      TRACEPULSE_STREAM_MAXLEN.toString(),
      '*',
      'traceId',
      payload.traceId,
      'serviceName',
      payload.serviceName,
      'spansCount',
      payload.spansCount.toString(),
      'ingestedAt',
      payload.ingestedAt.toString(),
      'payload',
      JSON.stringify(payload),
    );
    return id as string;
  }

  /**
   * Pipelines multiple trace payloads into Redis in a single network round-trip.
   */
  async xAddBatchStream(
    streamKey: string,
    payloads: TraceStreamPayload[],
  ): Promise<void> {
    if (!payloads.length) return;

    const pipeline = this.client.pipeline();
    for (const payload of payloads) {
      pipeline.xadd(
        streamKey,
        'MAXLEN',
        '~',
        TRACEPULSE_STREAM_MAXLEN.toString(),
        '*',
        'traceId',
        payload.traceId,
        'serviceName',
        payload.serviceName,
        'spansCount',
        payload.spansCount.toString(),
        'ingestedAt',
        payload.ingestedAt.toString(),
        'payload',
        JSON.stringify(payload),
      );
    }
    await pipeline.exec();
  }
}
