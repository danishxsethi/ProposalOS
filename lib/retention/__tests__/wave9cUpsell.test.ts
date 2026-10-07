/**
 * Wave 9C upsell trigger fixture tests.
 * Verifies tenant validation and idempotency for auto-generated upsell proposals.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { triggerUpsellProposal } from '@/lib/retention/upsellTrigger';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: { findFirst: vi.fn() },
    proposal: { findMany: vi.fn(), create: vi.fn() },
    evidenceSnapshot: { findFirst: vi.fn() },
  },
}));

describe('Wave 9C upsell trigger safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: audit not belonging to tenant returns null (cross-tenant rejection)
  it('should reject when audit does not belong to tenant', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue(null);

    const result = await triggerUpsellProposal('tenant-1', 'audit-1', 'test reason');

    expect(result).toBeNull();
    expect(vi.mocked(prisma.audit.findFirst)).toHaveBeenCalledWith({
      where: { id: 'audit-1', tenantId: 'tenant-1' },
    });
  });

  // Test 2: valid audit creates new upsell proposal
  it('should create upsell proposal for valid tenant-scoped audit', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue({ id: 'audit-1' } as any);
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);
    vi.mocked(prisma.proposal.create).mockResolvedValue({ id: 'prop-new' } as any);

    const result = await triggerUpsellProposal('tenant-1', 'audit-1', 'competitor gained reviews');

    expect(result).toEqual({ proposalId: 'prop-new' });
    expect(vi.mocked(prisma.proposal.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ auditId: 'audit-1', tenantId: 'tenant-1' }),
      })
    );
  });

  // Test 3: existing upsell proposal for same audit is reused (idempotency)
  it('should reuse existing upsell proposal instead of creating duplicate', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue({ id: 'audit-1' } as any);
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([
      { id: 'prop-existing', nextSteps: ['[upsell:true] earlier reason'] },
    ] as any);

    const result = await triggerUpsellProposal('tenant-1', 'audit-1', 'new reason');

    expect(result).toEqual({ proposalId: 'prop-existing' });
    expect(vi.mocked(prisma.proposal.create)).not.toHaveBeenCalled();
  });

  // Test 4: non-upsell proposals for the same audit don't block a new upsell
  it('should not treat a non-upsell proposal as a duplicate', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue({ id: 'audit-1' } as any);
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([
      { id: 'prop-regular', nextSteps: ['Follow up next week'] },
    ] as any);
    vi.mocked(prisma.proposal.create).mockResolvedValue({ id: 'prop-new-upsell' } as any);

    const result = await triggerUpsellProposal('tenant-1', 'audit-1', 'new reason');

    expect(result).toEqual({ proposalId: 'prop-new-upsell' });
    expect(vi.mocked(prisma.proposal.create)).toHaveBeenCalled();
  });

  // Test 5: DB error during creation returns null (no unhandled throw)
  it('should return null on database error', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue({ id: 'audit-1' } as any);
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);
    vi.mocked(prisma.proposal.create).mockRejectedValue(new Error('DB error'));

    const result = await triggerUpsellProposal('tenant-1', 'audit-1', 'reason');

    expect(result).toBeNull();
  });

  // Test 6: proposal query is scoped to the correct tenant when checking duplicates
  it('should scope duplicate-check query to the tenant', async () => {
    vi.mocked(prisma.audit.findFirst).mockResolvedValue({ id: 'audit-1' } as any);
    vi.mocked(prisma.proposal.findMany).mockResolvedValue([]);
    vi.mocked(prisma.proposal.create).mockResolvedValue({ id: 'prop-new' } as any);

    await triggerUpsellProposal('tenant-1', 'audit-1', 'reason');

    expect(vi.mocked(prisma.proposal.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ auditId: 'audit-1', tenantId: 'tenant-1' }),
      })
    );
  });
});
