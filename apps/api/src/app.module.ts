import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { RedisModule } from './redis/redis.module';
import { ClickHouseModule } from './clickhouse/clickhouse.module';
import { PrismaModule } from './prisma/prisma.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { HealthModule } from './health/health.module';
import { ConsumerModule } from './consumer/consumer.module';
import { AnomalyModule } from './anomaly/anomaly.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),
    RedisModule,
    ClickHouseModule,
    PrismaModule,
    IngestionModule,
    HealthModule,
    ConsumerModule,
    AnomalyModule,
  ],
})
export class AppModule {}
