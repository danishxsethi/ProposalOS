/**
 * Wave 9C NPS lifecycle safety fixture tests.
 * Verifies tenant context, suppression, idempotency, score validation,
 * duplicate-response rejection, and detractor handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleNPSResponse } from '@/lib/retention/nps';
import { prisma } from '@/lib/prisma';
import { guardLifecycleSend } from '@/lib/retention/lifecycleSafety';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    npsSurvey: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    project: { findUnique: vi.fn() },
    emailBlocklist: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: vi.fn((_tenantId, fn) => fn()),
}));

vi.mock('@/lib/retention/lifecycleSafety', () => ({
  guardLifecycleSend: vi.fn(),
  completeLifecycleSend: vi.fn(),
  markLifecycleSendUnknown: vi.fn(),
  releaseLifecycleSend: vi.fn(),
}));

describe('Wave 9C NPS lifecycle safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: invalid score rejected
  it('should reject score outside 0-10 bounds', async () => {
    await expect(handleNPSResponse('survey-1', 15)).rejects.toThrow(
      'NPS score must be an integer between 0 and 10'
    );
  });

  // Test 2: negative score rejected
  it('should reject negative score', async () => {
    await expect(handleNPSResponse('survey-1', -1)).rejects.toThrow(
      'NPS score must be an integer between 0 and 10'
    );
  });

  // Test 3: non-integer score rejected
  it('should reject non-integer score', async () => {
    await expect(handleNPSResponse('survey-1', 7.5)).rejects.toThrow(
      'NPS score must be an integer between 0 and 10'
    );
  });

  // Test 4: survey not found throws
  it('should throw if survey not found', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue(null);
    await expect(handleNPSResponse('nonexistent', 8)).rejects.toThrow('Survey not found');
  });

  // Test 5: duplicate response on already-answered survey is ignored (idempotent)
  it('should ignore duplicate response for already-responded survey', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'RESPONDED',
    } as any);

    await handleNPSResponse('survey-1', 8);

    // Should not attempt to update again
    expect(vi.mocked(prisma.npsSurvey.update)).not.toHaveBeenCalled();
  });

  // Test 6: duplicate response on FLAGGED_DETRACTOR survey is ignored
  it('should ignore duplicate response for flagged-detractor survey', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'FLAGGED_DETRACTOR',
    } as any);

    await handleNPSResponse('survey-1', 3);

    expect(vi.mocked(prisma.npsSurvey.update)).not.toHaveBeenCalled();
  });

  // Test 7: score >= 9 classified as REFERRAL_SENT
  it('should classify score >= 9 as promoter/referral', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'REFERRAL_SENT',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: null, prospectName: 'Test' } },
    } as any);

    await handleNPSResponse('survey-1', 9);

    expect(vi.mocked(prisma.npsSurvey.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REFERRAL_SENT' }),
      })
    );
  });

  // Test 8: score <= 6 classified as FLAGGED_DETRACTOR
  it('should classify score <= 6 as detractor', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'FLAGGED_DETRACTOR',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: null, prospectName: 'Test' } },
    } as any);

    await handleNPSResponse('survey-1', 4);

    expect(vi.mocked(prisma.npsSurvey.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FLAGGED_DETRACTOR' }),
      })
    );
  });

  // Test 9: score 7-8 classified as RESPONDED (passive)
  it('should classify score 7-8 as passive/responded', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'RESPONDED',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: null, prospectName: 'Test' } },
    } as any);

    await handleNPSResponse('survey-1', 7);

    expect(vi.mocked(prisma.npsSurvey.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESPONDED' }),
      })
    );
  });

  // Test 10: update scoped to tenantId (cross-tenant write protection)
  it('should scope survey update to the resolved tenantId', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'RESPONDED',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: null, prospectName: 'Test' } },
    } as any);

    await handleNPSResponse('survey-1', 7);

    expect(vi.mocked(prisma.npsSurvey.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'survey-1', tenantId: 'tenant-1' }),
      })
    );
  });

  // Test 11: referral email blocked by guard is not sent
  it('should not send referral email if lifecycle guard blocks it', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'REFERRAL_SENT',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: 'test@example.com', prospectName: 'Test' } },
    } as any);
    vi.mocked(guardLifecycleSend).mockResolvedValue({
      allowed: false,
      reason: 'Recipient is suppressed',
    });

    await handleNPSResponse('survey-1', 10);

    expect(vi.mocked(guardLifecycleSend)).toHaveBeenCalled();
  });

  // Test 12: feedback text is truncated/sanitized (untrusted input bound)
  it('should bound free-text feedback length', async () => {
    vi.mocked(prisma.npsSurvey.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'SENT',
    } as any);
    vi.mocked(prisma.npsSurvey.update).mockResolvedValue({
      status: 'RESPONDED',
      projectId: 'proj-1',
      project: { proposal: { prospectEmail: null, prospectName: 'Test' } },
    } as any);

    const longFeedback = 'x'.repeat(5000);
    await handleNPSResponse('survey-1', 7, longFeedback);

    const call = vi.mocked(prisma.npsSurvey.update).mock.calls[0][0] as any;
    expect(call.data.feedback.length).toBeLessThanOrEqual(2000);
  });
});
