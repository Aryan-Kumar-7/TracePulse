import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import {
  ExportTraceServiceRequest,
  ExportTraceServiceResponse,
  REDIS_STREAMS,
} from '@tracepulse/shared';
import { normalizeExportTraceRequest } from './otlp.normalizer';

export interface IngestionResult {
  totalSpans: number;
  traceBatches: number;
  durationMs: number;
  response: ExportTraceServiceResponse;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly streamKey: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.streamKey =
      this.configService.get<string>('redis.streamKey') || REDIS_STREAMS.TRACES;
  }

  /**
   * Process OpenTelemetry OTLP trace batch, normalize to domain spans,
   * and push to Redis Stream buffer with non-blocking pipelined execution.
   */
  async ingestTraces(
    request: ExportTraceServiceRequest,
  ): Promise<IngestionResult> {
    const startTime = performance.now();

    const { payloads, totalSpans } = normalizeExportTraceRequest(request);

    if (totalSpans === 0 || payloads.length === 0) {
      return {
        totalSpans: 0,
        traceBatches: 0,
        durationMs: Math.round(performance.now() - startTime),
        response: { partialSuccess: {} },
      };
    }

    try {
      if (payloads.length === 1) {
        await this.redisService.xAddStream(this.streamKey, payloads[0]);
      } else {
        await this.redisService.xAddBatchStream(this.streamKey, payloads);
      }

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      this.logger.log(
        `Ingested ${totalSpans} spans across ${payloads.length} trace batches in ${durationMs}ms`,
      );

      return {
        totalSpans,
        traceBatches: payloads.length,
        durationMs,
        response: { partialSuccess: {} },
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to buffer ${totalSpans} spans to Redis stream: ${err?.message || err}`,
        err?.stack,
      );
      throw err;
    }
  }
}
