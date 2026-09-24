import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  snapshotCreateMany: vi.fn(),
  findingCreateMany: vi.fn(),
  auditUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    evidenceSnapshot: { createMany: mocks.snapshotCreateMany },
    finding: { createMany: mocks.findingCreateMany },
    audit: { update: mocks.auditUpdate },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { persistAuditResult } from '@/lib/audit/findingPersistence';

describe('persistAuditResult atomic unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      evidenceSnapshot: { createMany: mocks.snapshotCreateMany },
      finding: { createMany: mocks.findingCreateMany },
      audit: { update: mocks.auditUpdate },
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
  });

  it('writes evidence, findings and final audit trust state in one transaction', async () => {
    const finding = {
      module: 'website', category: 'Performance', type: 'VITAMIN', title: 'Measured optimization opportunity',
      impactScore: 4, confidenceScore: 8, evidence: [{ pointer: 'https://business.test', source: 'pagespeed', collected_at: new Date().toISOString(), value: 70 }],
      metrics: {}, recommendedFix: [],
    };
    await persistAuditResult({
      auditId: 'audit-1', tenantId: 'tenant-1', findings: [finding],
      evidence: [{ module: 'website', source: 'pagespeed', rawResponse: { scores: { performance: 0.7 } }, targetUrl: 'https://business.test' }],
      auditUpdate: { status: 'COMPLETE', trustState: 'TRUSTED' },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.snapshotCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.findingCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects credential-bearing snapshots before starting the transaction', async () => {
    await expect(persistAuditResult({
      auditId: 'audit-1', tenantId: 'tenant-1', findings: [],
      evidence: [{ module: 'website', source: 'provider', rawResponse: { authorization: 'Bearer abcdef1234567890' } }],
      auditUpdate: { status: 'COMPLETE' },
    })).rejects.toThrow('AUDIT_EVIDENCE_SECRET_REJECTED');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
