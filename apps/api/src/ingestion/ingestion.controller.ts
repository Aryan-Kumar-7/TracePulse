import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { IngestionService } from './ingestion.service';
import { ExportTraceServiceRequestDto } from './dto/otlp-trace.dto';
import { ExportTraceServiceResponse } from '@tracepulse/shared';

@Controller('v1/traces')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * OpenTelemetry OTLP/HTTP JSON standard ingestion endpoint.
   * Specification: ExportTraceServiceRequest -> ExportTraceServiceResponse
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async ingestTraces(
    @Body() body: ExportTraceServiceRequestDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ExportTraceServiceResponse> {
    const result = await this.ingestionService.ingestTraces(body);

    // Provide high-throughput observability metadata in response headers
    reply.header('X-TracePulse-Ingested-Spans', result.totalSpans.toString());
    reply.header('X-TracePulse-Duration-Ms', result.durationMs.toString());

    return result.response;
  }
}
