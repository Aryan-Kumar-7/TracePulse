import { Controller, Get, Post, Query } from '@nestjs/common';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v1')
export class AnomalyController {
  constructor(
    private readonly anomalyService: AnomalyDetectorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Triggers an immediate moving-window anomaly check against ClickHouse.
   */
  @Post('anomaly/check')
  async triggerAnomalyCheck() {
    return this.anomalyService.runCheck();
  }

  /**
   * Returns current 5-minute moving-window service metrics from ClickHouse.
   */
  @Get('metrics/moving-window')
  async getMovingWindowMetrics(@Query('minutes') minutes?: string) {
    const windowMinutes = minutes ? parseInt(minutes, 10) : 5;
    return this.anomalyService.queryMovingWindowMetrics(windowMinutes);
  }

  /**
   * Returns all incidents from PostgreSQL, ordered with OPEN incidents first.
   */
  @Get('incidents')
  async listIncidents(@Query('status') status?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }
}
