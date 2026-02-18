import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mock dependencies before imports
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pipelineConfig: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/pipeline/stages/auditStage', () => ({
  processAuditStage: vi.fn(),
}));

import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { processAuditStage } from '@/lib/pipeline/stages/auditStage';

function makeRequest(headers: Record<string, string> = {}): Request {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Request;
}

describe('GET /api/cron/pipeline-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('returns 401 when CRON_SECRET is set and auth header is missing', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when CRON_SECRET is set and auth header is wrong', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('allows access when CRON_SECRET matches', async () => {
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);
    const res = await GET(
      makeRequest({ authorization: 'Bearer test-secret' })
    );
    expect(res.status).toBe(200);
  });

  it('allows access when CRON_SECRET is not set', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns early when no active tenants', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.message).toBe('No active tenants for audit');
  });

  it('filters out tenants with audit in pausedStages', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
      {
        id: '1',
        tenantId: 'tenant-paused',
        pausedStages: ['audit'],
        batchSize: 10,
      },
    ] as any);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(processAuditStage).not.toHaveBeenCalled();
  });

  it('processes active tenants and returns results', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
      {
        id: '1',
        tenantId: 'tenant-a',
        pausedStages: [],
        batchSize: 20,
      },
    ] as any);

    vi.mocked(processAuditStage).mockResolvedValue([
      {
        success: true,
        prospectId: 'p1',
        fromStatus: 'discovered',
        toStatus: 'audited',
        costCents: 50,
      },
      {
        success: false,
        prospectId: 'p2',
        fromStatus: 'discovered',
        toStatus: 'discovered',
        costCents: 0,
        error: 'timeout',
      },
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.results[0]).toEqual({
      tenantId: 'tenant-a',
      status: 'Complete',
      prospectsProcessed: 2,
      succeeded: 1,
      failed: 1,
    });
    expect(processAuditStage).toHaveBeenCalledWith('tenant-a', 20);
  });

  it('limits to MAX_TENANTS_PER_RUN (5)', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([]);
    await GET(makeRequest());
    expect(prisma.pipelineConfig.findMany).toHaveBeenCalledWith({
      take: 5,
      orderBy: { updatedAt: 'asc' },
    });
  });

  it('handles processAuditStage throwing an error gracefully', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
      {
        id: '1',
        tenantId: 'tenant-err',
        pausedStages: [],
        batchSize: 10,
      },
    ] as any);

    vi.mocked(processAuditStage).mockRejectedValue(new Error('DB down'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.results[0]).toEqual({
      tenantId: 'tenant-err',
      status: 'Failed',
      error: 'DB down',
    });
  });

  it('handles top-level errors and returns 500', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockRejectedValue(
      new Error('Connection refused')
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBe('Connection refused');
  });

  it('processes multiple tenants, skipping paused ones', async () => {
    vi.mocked(prisma.pipelineConfig.findMany).mockResolvedValue([
      { id: '1', tenantId: 't1', pausedStages: [], batchSize: 5 },
      { id: '2', tenantId: 't2', pausedStages: ['audit'], batchSize: 5 },
      { id: '3', tenantId: 't3', pausedStages: ['discovery'], batchSize: 10 },
    ] as any);

    vi.mocked(processAuditStage).mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.processed).toBe(2);
    expect(processAuditStage).toHaveBeenCalledTimes(2);
    expect(processAuditStage).toHaveBeenCalledWith('t1', 5);
    expect(processAuditStage).toHaveBeenCalledWith('t3', 10);
  });
});
