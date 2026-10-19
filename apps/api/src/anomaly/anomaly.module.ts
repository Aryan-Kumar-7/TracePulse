import { Module } from '@nestjs/common';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RcaModule } from '../rca/rca.module';
import { AnomalyDetectorService } from './anomaly-detector.service';
import { AnomalyController } from './anomaly.controller';

@Module({
  imports: [ClickHouseModule, PrismaModule, RcaModule],
  controllers: [AnomalyController],
  providers: [AnomalyDetectorService],
  exports: [AnomalyDetectorService],
})
export class AnomalyModule {}
