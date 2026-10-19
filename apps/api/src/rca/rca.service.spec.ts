import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RcaService } from './rca.service';
import { NotFoundException } from '@nestjs/common';
import { SpanTreeService } from './span-tree.service';
import { AiDiagnosisService } from './ai-diagnosis.service';

describe('RcaService', () => {
  let rcaService: RcaService;
  let mockPrisma: any;
  let mockClickHouse: any;
  let spanTreeService: SpanTreeService;
  let aiDiagnosisService: AiDiagnosisService;

  const mockIncident = {
    id: 'inc-123',
    projectId: 'proj-1',
    serviceName: 'order-service',
    traceId: '11111111-2222-3333-4444-555555555555',
    errorRate: 25.5,
    p99LatencyMs: 2500,
    summary: 'Error spike detected',
    rootCauseMarkdown: null,
    status: 'OPEN',
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: 'proj-1', name: 'TracePulse Core', slug: 'default' },
  };

  beforeEach(() => {
    mockPrisma = {
      incident: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    mockClickHouse = {
      getClient: () => ({
        query: vi.fn().mockResolvedValue({
          json: async () => [],
        }),
      }),
    };

    spanTreeService = new SpanTreeService(mockClickHouse);
    aiDiagnosisService = new AiDiagnosisService({ get: () => undefined } as any);

    rcaService = new RcaService(
      mockPrisma,
      mockClickHouse,
      spanTreeService,
      aiDiagnosisService,
    );
  });

  it('throws NotFoundException when diagnosing non-existent incident', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue(null);

    await expect(rcaService.diagnoseIncident('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('diagnoses incident and persists markdown post-mortem to PostgreSQL', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue(mockIncident);
    mockPrisma.incident.update.mockImplementation((args: any) => ({
      ...mockIncident,
      ...args.data,
    }));

    vi.spyOn(spanTreeService, 'getTraceSpans').mockResolvedValue([
      {
        trace_id: mockIncident.traceId,
        span_id: 's1',
        parent_span_id: '',
        service_name: 'order-service',
        name: 'POST /checkout',
        kind: 'SERVER',
        start_time: '2026-10-19 12:00:00.000000',
        end_time: '2026-10-19 12:00:02.500000',
        duration_ms: 2500,
        status_code: 'ERROR',
        status_message: 'QueryTimeoutException: Lock wait timeout exceeded',
        attributes: {
          'db.system': 'postgresql',
          'exception.type': 'QueryTimeoutException',
        },
      },
    ]);

    const updated = await rcaService.diagnoseIncident('inc-123');

    expect(mockPrisma.incident.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.incident.update.mock.calls[0][0];

    expect(updateCall.where.id).toBe('inc-123');
    expect(updateCall.data.rootCauseMarkdown).toContain('## Executive Summary & Severity');
    expect(updateCall.data.rootCauseMarkdown).toContain('## Root Cause Analysis');
    expect(updateCall.data.rootCauseMarkdown).toContain('## Remediation & Action Items');
    expect(updateCall.data.status).toBe('INVESTIGATING');
    expect(updated.rootCauseMarkdown).toBeTruthy();
  });

  it('handles incidents without traceId by synthesizing metric fallback', async () => {
    const noTraceIncident = { ...mockIncident, traceId: null };
    mockPrisma.incident.findUnique.mockResolvedValue(noTraceIncident);
    mockPrisma.incident.update.mockImplementation((args: any) => ({
      ...noTraceIncident,
      ...args.data,
    }));

    // ClickHouse returns no error traces either
    const updated = await rcaService.diagnoseIncident('inc-123');

    expect(mockPrisma.incident.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.incident.update.mock.calls[0][0];
    expect(updateCall.data.rootCauseMarkdown).toContain('Incident Diagnostic Report');
    expect(updateCall.data.rootCauseMarkdown).toContain('order-service');
  });
});
