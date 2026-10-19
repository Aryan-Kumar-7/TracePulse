import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { ClickHouseModule } from '../clickhouse/clickhouse.module';
import { ClickHouseBatchService } from './clickhouse-batch.service';

@Module({
  imports: [RedisModule, ClickHouseModule],
  providers: [ClickHouseBatchService],
  exports: [ClickHouseBatchService],
})
export class ConsumerModule { }
