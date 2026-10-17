import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

@Injectable()
export class ClickHouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickHouseService.name);
  private client: ClickHouseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('clickhouse.host', 'http://localhost:8123');
    const database = this.configService.get<string>('clickhouse.db', 'default');
    const username = this.configService.get<string>('clickhouse.user', 'default');
    const password = this.configService.get<string>('clickhouse.password', '');

    this.client = createClient({
      url: host,
      database,
      username,
      password,
      request_timeout: 10_000,
    });

    this.logger.log(`Initialized ClickHouse client targeting ${host} (db: ${database})`);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.logger.log('ClickHouse client closed gracefully.');
    }
  }

  getClient(): ClickHouseClient {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res.success;
    } catch {
      return false;
    }
  }
}
