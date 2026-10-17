import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { RedisService } from '../redis/redis.service';
import { ClickHouseService } from '../clickhouse/clickhouse.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly clickHouseService: ClickHouseService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) reply: FastifyReply) {
    const [redisHealthy, clickhouseHealthy, postgresHealthy] = await Promise.all([
      this.redisService.ping(),
      this.clickHouseService.ping(),
      this.prismaService.ping(),
    ]);

    const isHealthy = redisHealthy && clickhouseHealthy && postgresHealthy;

    if (!isHealthy) {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        redis: redisHealthy ? 'up' : 'down',
        clickhouse: clickhouseHealthy ? 'up' : 'down',
        postgres: postgresHealthy ? 'up' : 'down',
      },
    };
  }
}
