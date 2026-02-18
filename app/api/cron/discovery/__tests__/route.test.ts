import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pipelineConfig: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    prospectDiscoveryJob: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock discover
const mockDiscover = vi.fn();
vi.mock('@/lib/pipeline/discovery', () => ({
  discover: (...args: unknown[]) => mockDiscover(...args),
}));

import { GET } from '../route';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set('authorization', authHeader);
  return new Request('http://localhost/api/cron/discovery', { headers });
}

describe('GET /api/cron/discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('returns 401 when CRON_SECRET is set and auth header is wrong', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const res = await GET(makeRequest('Bearer wrong'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows access when CRON_SECRET matches', async () => {
    process.env.CRON_SECRET = 'test-secret';
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
  });

  it('allows access when CRON_SECRET is not set', async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it('returns early when no active configs exist', async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.message).toBe('No active tenants for discovery');
  });

  it('filters out tenants with discovery in pausedStages', async () => {
    mockFindMany.mockResolvedValue([
      { tenantId: 't1', pausedStages: ['discovery'], painScoreThreshold: 60, dailyVolumeLimit: 200 },
    ]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.processed).toBe(0);
  });

  it('processes active tenants and triggers discovery', async () => {
    mockFindMany.mockResolvedValue([
      { tenantId: 't1', pausedStages: [], painScoreThreshold: 60, dailyVolumeLimit: 200, updatedAt: new Date() },
    ]);
    mockFindFirst.mockResolvedValue(null); // No queued job
    mockDiscover.mockResolvedValue({
      jobId: 'j1',
      tenantId: 't1',
      prospectsFound: 10,
      prospectsQualified: 5,
      costCents: 0,
      completedAt: new Date(),
    });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.results[0].tenantId).toBe('t1');
    expect(body.results[0].status).toBe('Started');
  });

  it('uses discovery job config when a queued job exists', async () => {
    mockFindMany.mockResolvedValue([
      { tenantId: 't1', pausedStages: [], painScoreThreshold: 60, dailyVolumeLimit: 200, updatedAt: new Date() },
    ]);
    mockFindFirst.mockResolvedValue({
      id: 'job1',
      tenantId: 't1',
      city: 'Austin',
      state: 'TX',
      vertical: 'dental',
      targetLeads: 100,
      painThreshold: 70,
      sourceConfig: { googlePlaces: true, yelp: true, directories: false },
    });
    mockUpdate.mockResolvedValue({});
    mockDiscover.mockResolvedValue({
      jobId: 'j1',
      tenantId: 't1',
      prospectsFound: 5,
      prospectsQualified: 3,
      costCents: 0,
      completedAt: new Date(),
    });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(1);

    // Verify job was marked as RUNNING
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job1' },
        data: expect.objectContaining({ status: 'RUNNING' }),
      })
    );

    // Verify discover was called with the job's config
    expect(mockDiscover).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'Austin',
        state: 'TX',
        vertical: 'dental',
        targetLeads: 100,
        painThreshold: 70,
      }),
      't1'
    );
  });

  it('handles individual tenant errors gracefully', async () => {
    mockFindMany.mockResolvedValue([
      { tenantId: 't1', pausedStages: [], painScoreThreshold: 60, dailyVolumeLimit: 200, updatedAt: new Date() },
      { tenantId: 't2', pausedStages: [], painScoreThreshold: 60, dailyVolumeLimit: 200, updatedAt: new Date() },
    ]);
    // First tenant throws, second succeeds
    mockFindFirst
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(null);
    mockDiscover.mockResolvedValue({
      jobId: 'j2',
      tenantId: 't2',
      prospectsFound: 3,
      prospectsQualified: 1,
      costCents: 0,
      completedAt: new Date(),
    });

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(2);
    expect(body.results[0].status).toBe('Failed');
    expect(body.results[0].error).toBe('DB error');
    expect(body.results[1].status).toBe('Started');
  });

  it('returns 500 on top-level error', async () => {
    mockFindMany.mockRejectedValue(new Error('Connection lost'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
  });
});
