import { createHash } from 'crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lifecycleOccurrence: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    npsSurvey: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { prisma } from '@/lib/prisma';
import { checkCompetitorChanges } from '@/lib/retention/competitor-monitor';
import {
  cancelLifecycleOccurrence,
  completeLifecycleOccurrence,
  replayLifecycleOccurrence,
  scheduleLifecycleRetry,
} from '@/lib/retention/lifecycleControl';
import { createNpsResponseToken, handleNPSResponseToken } from '@/lib/retention/nps';

const occurrence = {
  tenantId: 'tenant-1',
  workflow: 'NPS' as const,
  entityId: 'survey-1',
  occurrenceKey: '30',
  idempotencyKey: 'nps:project-1:30',
};

describe('Wave 9D lifecycle controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COMPETITOR_MONITOR_PROVIDER;
  });

  it('issues high-entropy NPS tokens and only uses their hash for lookup', () => {
    const first = createNpsResponseToken();
    const second = createNpsResponseToken();
    expect(first.raw).toMatch(/^[a-f0-9]{64}$/);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).toBe(createHash('sha256').update(first.raw).digest('hex'));
    expect(first.hash).not.toBe(first.raw);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts an unexpired token once without exposing tenant identity', async () => {
    const token = createNpsResponseToken();
    vi.mocked(prisma.npsSurvey.findFirst).mockResolvedValue({
      id: 'survey-1',
      tokenHash: token.hash,
    } as any);
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'RESPONDED',
    } as any);

    await expect(handleNPSResponseToken(token.raw, 8)).resolves.toBe(true);
    expect(vi.mocked(prisma.npsSurvey.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenHash: token.hash }) })
    );
  });

  it('fails malformed or expired public tokens generically', async () => {
    await expect(handleNPSResponseToken('nope', 8)).resolves.toBe(false);
    vi.mocked(prisma.npsSurvey.findFirst).mockResolvedValue(null);
    await expect(handleNPSResponseToken(createNpsResponseToken().raw, 8)).resolves.toBe(false);
  });

  it('cancellation is idempotent and late completion cannot overwrite it', async () => {
    vi.mocked(prisma.lifecycleOccurrence.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 0 } as any);
    await expect(
      cancelLifecycleOccurrence({ ...occurrence, actor: 'recipient', reason: 'unsubscribe' })
    ).resolves.toBe(true);
    await expect(completeLifecycleOccurrence(occurrence)).resolves.toBe(false);
    expect(vi.mocked(prisma.lifecycleOccurrence.updateMany)).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) })
    );
  });

  it('bounds retries and permits one authorized idempotent replay', async () => {
    vi.mocked(prisma.lifecycleOccurrence.findUnique).mockResolvedValue({
      attemptCount: 3,
      maxAttempts: 3,
      cancelledAt: null,
    } as any);
    vi.mocked(prisma.lifecycleOccurrence.updateMany)
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 0 } as any);

    await expect(scheduleLifecycleRetry(occurrence, 'timeout')).resolves.toBe('DEAD');
    await expect(replayLifecycleOccurrence(occurrence, 'operator-1', false)).resolves.toBe(false);
    await expect(replayLifecycleOccurrence(occurrence, 'operator-1', true)).resolves.toBe(true);
    await expect(replayLifecycleOccurrence(occurrence, 'operator-1', true)).resolves.toBe(false);
  });

  it('does not treat an unavailable competitor provider as unchanged', async () => {
    await expect(checkCompetitorChanges('tenant-1', 'proposal-1', 'Retail')).resolves.toEqual({
      status: 'NOT_CONFIGURED',
      signals: [],
    });
    process.env.COMPETITOR_MONITOR_PROVIDER = 'approved-but-uninstalled';
    await expect(checkCompetitorChanges('tenant-1', 'proposal-1', 'Retail')).resolves.toEqual({
      status: 'UNAVAILABLE',
      signals: [],
    });
  });
});
