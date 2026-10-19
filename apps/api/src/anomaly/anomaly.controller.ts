import { Controller, Get, Post, Query } from '@nestjs/common';
import { AnomalyDetectorService } from './anomaly-detector.service';

@Controller(['v1', 'anomalies', 'v1/anomalies'])
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyDetectorService) {}

  /**
   * Triggers an immediate moving-window anomaly check against ClickHouse.
   */
  @Post(['anomaly/check', 'check'])
  async triggerAnomalyCheck() {
    return this.anomalyService.runCheck();
  }

  /**
   * Returns current 5-minute moving-window service metrics from ClickHouse.
   * Matches both GET /v1/metrics/moving-window and GET /anomalies/metrics.
   */
  @Get(['metrics/moving-window', 'metrics'])
  async getMovingWindowMetrics(@Query('minutes') minutes?: string) {
    const windowMinutes = minutes ? parseInt(minutes, 10) : 5;
    return this.anomalyService.queryMovingWindowMetrics(windowMinutes);
  }
}
