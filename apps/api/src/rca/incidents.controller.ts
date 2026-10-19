import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RcaService } from './rca.service';
import { IncidentStatus } from '@prisma/client';

@Controller(['incidents', 'v1/incidents'])
export class IncidentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rcaService: RcaService,
  ) {}

  /**
   * Lists recent incidents with optional status and service filters.
   */
  @Get()
  async listIncidents(
    @Query('status') status?: string,
    @Query('serviceName') serviceName?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = {};
    if (status && Object.values(IncidentStatus).includes(status as IncidentStatus)) {
      where.status = status as IncidentStatus;
    }
    if (serviceName) {
      where.serviceName = serviceName;
    }

    const take = limit ? Math.min(parseInt(limit, 10) || 50, 100) : 50;

    return this.prisma.incident.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * Fetches a single incident with its complete AI post-mortem report.
   */
  @Get(':id')
  async getIncident(@Param('id') id: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID "${id}" was not found.`);
    }

    return incident;
  }

  /**
   * Manually re-triggers AI Root Cause Analysis diagnosis for a specific incident.
   */
  @Post(':id/diagnose')
  @HttpCode(HttpStatus.OK)
  async diagnoseIncident(
    @Param('id') id: string,
    @Query('traceId') traceId?: string,
  ) {
    return this.rcaService.diagnoseIncident(id, traceId);
  }
}
