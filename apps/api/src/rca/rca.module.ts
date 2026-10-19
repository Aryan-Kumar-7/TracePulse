import { Module } from '@nestjs/common';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpanTreeService } from './span-tree.service';
import { AiDiagnosisService } from './ai-diagnosis.service';
import { RcaService } from './rca.service';
import { IncidentsController } from './incidents.controller';
import { TracesController } from './traces.controller';

@Module({
  imports: [ClickHouseModule, PrismaModule],
  controllers: [IncidentsController, TracesController],
  providers: [SpanTreeService, AiDiagnosisService, RcaService],
  exports: [SpanTreeService, AiDiagnosisService, RcaService],
})
export class RcaModule {}
