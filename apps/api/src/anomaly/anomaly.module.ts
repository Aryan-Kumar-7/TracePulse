import { Module } from '@nestjs/common';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { AnomalyController } from './anomaly.controller';

@Module({
  imports: [ClickHouseModule, PrismaModule],
  controllers: [AnomalyController],
  providers: [AnomalyDetectorService],
  exports: [AnomalyDetectorService],
})
export class AnomalyModule {}
