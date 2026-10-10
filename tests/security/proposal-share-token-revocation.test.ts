// @vitest-environment node
import { createHash, randomUUID } from 'crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
  transaction: vi.fn(),
  recordAuditTrailEvent: vi.fn(),
  runWithTenantBypass: vi.fn(),
  runWithPrismaTransactionContext: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: mocks.recordAuditTrailEvent,
}));
vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
  runWithPrismaTransactionContext: mocks.runWithPrismaTransactionContext,
}));

import {
  inspectProposalShareTokens,
  ProposalShareRevocationConflict,
  revokeProposalShareTokens,
} from '@/lib/proposal/shareTokenRevocation';

const token = randomUUID();
const fingerprint = createHash('sha256').update(token).digest('hex');

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proposal-1',
    tenantId: 'tenant-1',
    auditId: 'audit-1',
    status: 'SENT',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    publicAccessRevokedAt: null,
    webLinkToken: token,
    ...overrides,
  };
}

describe('proposal share-token revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runWithTenantBypass.mockImplementation((_reason, callback) => callback());
    mocks.runWithPrismaTransactionContext.mockImplementation((_tx, callback) => callback());
    mocks.transaction.mockImplementation((callback) => callback({}));
    mocks.recordAuditTrailEvent.mockResolvedValue(undefined);
  });

  it('dry-runs exact matches without returning the bearer token', async () => {
    mocks.findMany.mockResolvedValue([proposal()]);

    const result = await inspectProposalShareTokens([token]);

    expect(result).toEqual([
      expect.objectContaining({
        tokenFingerprint: fingerprint,
        disposition: 'NOT_REVOKED',
        proposalId: 'proposal-1',
        tenantId: 'tenant-1',
        auditId: 'audit-1',
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { webLinkToken: { in: [token] } },
      })
    );
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('reports unmatched tokens without returning them', async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await inspectProposalShareTokens([token]);

    expect(result[0]).toMatchObject({
      disposition: 'NOT_FOUND',
      proposalId: null,
      tenantId: null,
      auditId: null,
    });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('revokes the exact tenant-owned row and records the operator in the same transaction', async () => {
    mocks.findMany.mockResolvedValue([proposal()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const result = await revokeProposalShareTokens({
      tokens: [token],
      expectedTargets: [
        {
          tokenFingerprint: fingerprint,
          proposalId: 'proposal-1',
          tenantId: 'tenant-1',
          auditId: 'audit-1',
        },
      ],
      actorId: 'operator-1',
    });

    expect(result[0]).toMatchObject({
      disposition: 'REVOKED',
      proposalId: 'proposal-1',
      tenantId: 'tenant-1',
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'proposal-1',
          tenantId: 'tenant-1',
          webLinkToken: token,
          publicAccessRevokedAt: null,
        },
        data: { publicAccessRevokedAt: expect.any(Date) },
      })
    );
    expect(mocks.recordAuditTrailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'proposal.access_revoked',
        tenantId: 'tenant-1',
        auditId: 'audit-1',
        proposalId: 'proposal-1',
        actorId: 'operator-1',
        payload: expect.objectContaining({ reason: 'historical_public_token_exposure' }),
      })
    );
    expect(JSON.stringify(mocks.recordAuditTrailEvent.mock.calls)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('rejects a changed record snapshot before writing', async () => {
    mocks.findMany.mockResolvedValue([proposal()]);

    await expect(
      revokeProposalShareTokens({
        tokens: [token],
        expectedTargets: [
          {
            tokenFingerprint: fingerprint,
            proposalId: 'different-proposal',
            tenantId: 'tenant-1',
            auditId: 'audit-1',
          },
        ],
        actorId: 'operator-1',
      })
    ).rejects.toBeInstanceOf(ProposalShareRevocationConflict);

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAuditTrailEvent).not.toHaveBeenCalled();
  });

  it('is idempotent for a row that is already revoked', async () => {
    const revokedAt = new Date('2026-10-08T12:00:00.000Z');
    mocks.findMany.mockResolvedValue([proposal({ publicAccessRevokedAt: revokedAt })]);

    const result = await revokeProposalShareTokens({
      tokens: [token],
      expectedTargets: [
        {
          tokenFingerprint: fingerprint,
          proposalId: 'proposal-1',
          tenantId: 'tenant-1',
          auditId: 'audit-1',
        },
      ],
      actorId: 'operator-1',
    });

    expect(result[0]).toMatchObject({
      disposition: 'ALREADY_REVOKED',
      revokedAt: revokedAt.toISOString(),
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAuditTrailEvent).not.toHaveBeenCalled();
  });

  it('rolls back by propagating audit-write failure', async () => {
    mocks.findMany.mockResolvedValue([proposal()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.recordAuditTrailEvent.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      revokeProposalShareTokens({
        tokens: [token],
        expectedTargets: [
          {
            tokenFingerprint: fingerprint,
            proposalId: 'proposal-1',
            tenantId: 'tenant-1',
            auditId: 'audit-1',
          },
        ],
        actorId: 'operator-1',
      })
    ).rejects.toThrow('audit unavailable');
  });
});
