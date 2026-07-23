/**
 * Unit tests for infrastructure modules.
 * Requirements: 17.1, 17.4, 17.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
// emailInfra.ts uses Prisma; mock it before importing the module.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailDomainHealth: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { rotateDomain, warmupDomain } from '../emailInfra';
import {
  getShardHealth,
  resetShardConfig,
  applyShardConfig,
} from '../sharding';
import {
  adjustScaling,
  resetScalingConfig,
  getScalingStatus,
} from '../scaling';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDomainRecord(overrides: Partial<{
  domain: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  reputation: number;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  lastHealthCheck: Date;
  warmupCompletedAt: Date | null;
  flaggedAt: Date | null;
}> = {}) {
  return {
    id: 'test-id',
    tenantId: null,
    domain: 'test.mail',
    fromEmail: null,
    status: 'healthy',
    dailyLimit: 1000,
    sentToday: 0,
    reputation: 80,
    spfValid: true,
    dkimValid: true,
    dmarcValid: true,
    warmupStartedAt: null,
    warmupCompletedAt: null,
    flaggedAt: null,
    lastHealthCheck: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── rotateDomain ─────────────────────────────────────────────────────────────

describe('rotateDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the rotated domain as flagged in EmailDomainHealth', async () => {
    const flaggedDomain = 'bad.mail';
    const replacementRecord = makeDomainRecord({ domain: 'good.mail', reputation: 90 });

    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain: flaggedDomain, status: 'flagged' })
    );
    vi.mocked(prisma.emailDomainHealth.findFirst).mockResolvedValue(replacementRecord);

    const result = await rotateDomain(flaggedDomain, 'deliverability drop');

    // The update call should set status to 'flagged'
    expect(prisma.emailDomainHealth.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: flaggedDomain },
        data: expect.objectContaining({ status: 'flagged' }),
      })
    );

    expect(result.rotatedFrom).toBe(flaggedDomain);
    expect(result.rotatedTo).toBe('good.mail');
  });

  it('selects the healthy domain with the highest reputation as replacement', async () => {
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain: 'flagged.mail', status: 'flagged' })
    );
    vi.mocked(prisma.emailDomainHealth.findFirst).mockResolvedValue(
      makeDomainRecord({ domain: 'best.mail', reputation: 95 })
    );

    const result = await rotateDomain('flagged.mail', 'test');

    // findFirst should query for healthy domains with valid DNS, ordered by reputation desc
    expect(prisma.emailDomainHealth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'healthy',
          spfValid: true,
          dkimValid: true,
          dmarcValid: true,
        }),
        orderBy: { reputation: 'desc' },
      })
    );

    expect(result.rotatedTo).toBe('best.mail');
  });

  it('returns rotatedTo null when no healthy replacement is available', async () => {
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain: 'only.mail', status: 'flagged' })
    );
    vi.mocked(prisma.emailDomainHealth.findFirst).mockResolvedValue(null);

    const result = await rotateDomain('only.mail', 'no replacements');

    expect(result.rotatedFrom).toBe('only.mail');
    expect(result.rotatedTo).toBeNull();
  });
});

// ─── warmupDomain ─────────────────────────────────────────────────────────────

describe('warmupDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('doubles the daily limit on each warmup step', async () => {
    const domain = 'warming.mail';
    const initialLimit = 200;

    vi.mocked(prisma.emailDomainHealth.findUnique).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: initialLimit })
    );
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: 400 })
    );

    const result = await warmupDomain(domain);

    expect(result.previousLimit).toBe(initialLimit);
    expect(result.newLimit).toBe(400); // doubled
    expect(result.status).toBe('warming');
  });

  it('does not exceed the maximum daily limit of 5000', async () => {
    const domain = 'nearmax.mail';

    vi.mocked(prisma.emailDomainHealth.findUnique).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: 3000 })
    );
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain, status: 'healthy', dailyLimit: 5000 })
    );

    const result = await warmupDomain(domain);

    // 3000 * 2 = 6000, but capped at 5000
    expect(result.newLimit).toBe(5000);
    expect(result.newLimit).toBeLessThanOrEqual(5000);
  });

  it('promotes domain to healthy when limit reaches max', async () => {
    const domain = 'almostdone.mail';

    vi.mocked(prisma.emailDomainHealth.findUnique).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: 2500 })
    );
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain, status: 'healthy', dailyLimit: 5000 })
    );

    const result = await warmupDomain(domain);

    expect(result.newLimit).toBe(5000);
    expect(result.status).toBe('healthy');
    expect(result.warmupCompletedAt).not.toBeNull();
  });

  it('keeps status as warming when limit has not reached max', async () => {
    const domain = 'early.mail';

    vi.mocked(prisma.emailDomainHealth.findUnique).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: 50 })
    );
    vi.mocked(prisma.emailDomainHealth.update).mockResolvedValue(
      makeDomainRecord({ domain, status: 'warming', dailyLimit: 100 })
    );

    const result = await warmupDomain(domain);

    expect(result.status).toBe('warming');
    expect(result.warmupCompletedAt).toBeNull();
  });

  it('throws when the domain does not exist', async () => {
    vi.mocked(prisma.emailDomainHealth.findUnique).mockResolvedValue(null);

    await expect(warmupDomain('ghost.mail')).rejects.toThrow('Domain not found: ghost.mail');
  });
});

// ─── getShardHealth ───────────────────────────────────────────────────────────

describe('getShardHealth', () => {
  beforeEach(() => {
    resetShardConfig();
  });

  it('returns one ShardHealth entry per configured shard', () => {
    const shards = getShardHealth();
    // Default config has 8 shards
    expect(shards).toHaveLength(8);
  });

  it('returns the correct number of shards after config change', () => {
    applyShardConfig({ shardCount: 4 });
    const shards = getShardHealth();
    expect(shards).toHaveLength(4);
  });

  it('each shard has a unique shardId matching its index', () => {
    const shards = getShardHealth();
    shards.forEach((shard, index) => {
      expect(shard.shardId).toBe(index);
    });
  });

  it('each shard has the correct number of replica nodes', () => {
    // Default readReplicas = 2
    const shards = getShardHealth();
    shards.forEach((shard) => {
      expect(shard.replicaNodes).toHaveLength(2);
    });
  });

  it('all shards start as healthy', () => {
    const shards = getShardHealth();
    shards.forEach((shard) => {
      expect(shard.status).toBe('healthy');
    });
  });

  it('returns a copy — mutations do not affect internal state', () => {
    const shards = getShardHealth();
    shards[0].status = 'offline';

    const shards2 = getShardHealth();
    expect(shards2[0].status).toBe('healthy');
  });
});

// ─── adjustScaling ────────────────────────────────────────────────────────────

describe('adjustScaling', () => {
  beforeEach(() => {
    resetScalingConfig();
  });

  it('applies valid config overrides successfully', () => {
    const result = adjustScaling({ maxInstances: 30 });
    expect(result.maxInstances).toBe(30);
  });

  it('throws when minInstances exceeds maxInstances', () => {
    expect(() => adjustScaling({ minInstances: 100, maxInstances: 5 })).toThrow(
      /minInstances must be <= maxInstances/
    );
  });

  it('throws when targetCPUUtilization is out of 0–100 range', () => {
    expect(() => adjustScaling({ targetCPUUtilization: 150 })).toThrow(
      /targetCPUUtilization must be 0–100/
    );
    expect(() => adjustScaling({ targetCPUUtilization: -1 })).toThrow(
      /targetCPUUtilization must be 0–100/
    );
  });

  it('throws when scaleDownThreshold >= scaleUpThreshold', () => {
    expect(() =>
      adjustScaling({ scaleDownThreshold: 70, scaleUpThreshold: 70 })
    ).toThrow(/scaleDownThreshold must be < scaleUpThreshold/);
  });

  it('throws when cooldownSeconds is negative', () => {
    expect(() => adjustScaling({ cooldownSeconds: -10 })).toThrow(
      /cooldownSeconds must be >= 0/
    );
  });

  it('persists the new config so getScalingStatus reflects it', () => {
    adjustScaling({ maxInstances: 20, minInstances: 3 });
    const status = getScalingStatus();
    expect(status.config.maxInstances).toBe(20);
    expect(status.config.minInstances).toBe(3);
  });

  it('clamps current instances to new maxInstances bound', () => {
    // First scale up to a high instance count by setting a large max
    adjustScaling({ maxInstances: 50 });
    // Now reduce max below current — instances should be clamped
    adjustScaling({ maxInstances: 2, minInstances: 1 });
    const status = getScalingStatus();
    expect(status.currentInstances).toBeLessThanOrEqual(2);
  });
});
