import { Allow, IsArray, IsOptional } from 'class-validator';
import { ExportTraceServiceRequest } from '@tracepulse/shared';

/**
 * OpenTelemetry ExportTraceServiceRequest DTO
 */
export class ExportTraceServiceRequestDto implements ExportTraceServiceRequest {
  @Allow()
  @IsOptional()
  @IsArray()
  resourceSpans?: any[];
}
