import { Controller, Get, Param, Query } from '@nestjs/common';
import { SpanTreeService } from './span-tree.service';
import { RcaService } from './rca.service';

@Controller(['traces', 'v1/traces-view'])
export class TracesController {
  constructor(
    private readonly spanTreeService: SpanTreeService,
    private readonly rcaService: RcaService,
  ) {}

  /**
   * Returns a list of recently ingested traces for quick exploration in UI.
   */
  @Get('recent')
  async getRecentTraces(@Query('limit') limit?: string) {
    const take = limit ? parseInt(limit, 10) : 20;
    return this.spanTreeService.getRecentTraces(take);
  }

  /**
   * Returns reconstructed span tree and critical failure path for any trace.
   */
  @Get(':traceId/tree')
  async getTraceTree(@Param('traceId') traceId: string) {
    const spans = await this.spanTreeService.getTraceSpans(traceId);
    const tree = this.spanTreeService.buildSpanTree(spans);
    const criticalPath = this.spanTreeService.extractCriticalFailurePath(tree);
    const ascii = this.spanTreeService.formatSpanTreeAscii(tree, criticalPath);

    return {
      traceId,
      totalSpans: tree.totalSpans,
      durationMs: tree.durationMs,
      services: tree.services,
      hasErrors: tree.hasErrors,
      criticalPath,
      asciiTree: ascii,
      rootNodes: tree.rootNodes,
    };
  }

  /**
   * Directly runs AI diagnosis on any trace.
   */
  @Get(':traceId/diagnose')
  async diagnoseTrace(
    @Param('traceId') traceId: string,
    @Query('serviceName') serviceName?: string,
  ) {
    return this.rcaService.diagnoseTrace(traceId, serviceName);
  }
}
