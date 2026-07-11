/**
 * Wave 3 (Step 6 — persistence enforcement boundary, P1-09/P2-36): the persistence
 * layer must independently refuse malformed findings, even ones that already passed an
 * upstream check, and must never trust auditId/tenantId/module off the finding object.
 * No live database — `prisma.finding.createMany` is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    finding: {
      createMany: (...args: unknown[]) => mockCreateMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { excludeFinding, persistFindings, updateFindingFields } from '../findingPersistence';

const realEvidence = {
  pointer: 'https://acme-dental.com/',
  source: 'html_analysis',
  collected_at: new Date().toISOString(),
};

function validFinding(overrides: Record<string, unknown> = {}) {
  return {
    module: 'techStack',
    category: 'Performance',
    type: 'VITAMIN',
    title: 'Modern Technology Stack',
    description: 'Your website uses modern technologies.',
    impactScore: 3,
    confidenceScore: 8,
    evidence: [realEvidence],
    metrics: {},
    effortEstimate: 'LOW',
    recommendedFix: [],
    ...overrides,
  };
}

describe('persistFindings', () => {
  beforeEach(() => {
    mockCreateMany.mockClear();
    mockUpdate.mockClear();
  });

  it('persists a valid finding', async () => {
    const result = await persistFindings('audit-1', 'tenant-1', [validFinding()]);
    expect(result.persisted).toBe(1);
    expect(result.rejected).toEqual([]);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed finding before the Prisma call and never persists it', async () => {
    const result = await persistFindings('audit-1', 'tenant-1', [validFinding({ evidence: [] })]);
    expect(result.persisted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('explicit partial-batch policy: a malformed item never blocks valid siblings', async () => {
    const result = await persistFindings('audit-1', 'tenant-1', [
      validFinding({ title: 'Good Finding One' }),
      validFinding({ evidence: [], title: 'Bad Finding' }),
      validFinding({ title: 'Good Finding Two' }),
    ]);
    expect(result.persisted).toBe(2);
    expect(result.rejected).toHaveLength(1);
    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const written = mockCreateMany.mock.calls[0][0].data;
    expect(written).toHaveLength(2);
    expect(written.every((f: { title: string }) => f.title !== 'Bad Finding')).toBe(true);
  });

  it('injects auditId/tenantId from function parameters, never trusting the finding object', async () => {
    await persistFindings('trusted-audit', 'trusted-tenant', [
      validFinding({ auditId: 'attacker-audit', tenantId: 'attacker-tenant' }),
    ]);
    const written = mockCreateMany.mock.calls[0][0].data[0];
    expect(written.auditId).toBe('trusted-audit');
    expect(written.tenantId).toBe('trusted-tenant');
  });

  it('does not call Prisma at all for an empty batch', async () => {
    const result = await persistFindings('audit-1', 'tenant-1', []);
    expect(result.persisted).toBe(0);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});

describe('updateFindingFields (bounded human-review edits)', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
  });

  it('never touches evidence/module/auditId/tenantId', async () => {
    await updateFindingFields('finding-1', { title: 'Edited title' });
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('evidence');
    expect(data).not.toHaveProperty('module');
    expect(data).not.toHaveProperty('auditId');
    expect(data).not.toHaveProperty('tenantId');
    expect(data.manuallyEdited).toBe(true);
  });

  it('rejects an out-of-bounds impactScore', async () => {
    await expect(updateFindingFields('finding-1', { impactScore: 99 })).rejects.toThrow(RangeError);
  });
});

describe('excludeFinding', () => {
  it('marks the finding excluded and manually edited', async () => {
    await excludeFinding('finding-1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'finding-1' },
      data: { excluded: true, manuallyEdited: true },
    });
  });
});
