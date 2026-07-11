/**
 * Wave 3 (root-cause group D): runtime Finding/Evidence contract tests.
 * Red-before/green-after — before this wave there was no runtime schema at all; a
 * finding with `evidence: []` or a placeholder pointer passed straight through to
 * `prisma.finding.createMany` unchecked (P1-09/P2-36).
 */
import { describe, expect, it } from 'vitest';

import {
  hasContractValidEvidence,
  normalizeAndValidateModuleFindings,
  validateEvidenceItem,
  validateFinding,
  validateFindingForPersistence,
} from '../findingContract';

const realEvidence = {
  pointer: 'https://acme-dental.com/',
  source: 'html_analysis',
  collected_at: new Date().toISOString(),
  type: 'text',
  value: 'WordPress',
  label: 'CMS Detected',
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

describe('EvidenceRuntimeSchema (via validateEvidenceItem)', () => {
  it('accepts a valid URL evidence item', () => {
    expect(validateEvidenceItem(realEvidence).success).toBe(true);
  });

  it('accepts a provider-record pointer', () => {
    expect(
      validateEvidenceItem({
        ...realEvidence,
        pointer: 'https://places.googleapis.com/v1/places/abc123#editorialSummary',
      }).success
    ).toBe(true);
  });

  it('rejects a missing pointer', () => {
    const rest: Record<string, unknown> = { ...realEvidence };
    delete rest.pointer;
    expect(validateEvidenceItem(rest).success).toBe(false);
  });

  it('rejects an empty/whitespace pointer', () => {
    expect(validateEvidenceItem({ ...realEvidence, pointer: '' }).success).toBe(false);
    expect(validateEvidenceItem({ ...realEvidence, pointer: '   ' }).success).toBe(false);
  });

  it("rejects 'unknown'/'n/a' placeholder pointers", () => {
    expect(validateEvidenceItem({ ...realEvidence, pointer: 'unknown' }).success).toBe(false);
    expect(validateEvidenceItem({ ...realEvidence, pointer: 'n/a' }).success).toBe(false);
  });

  it('rejects an invalid collected_at timestamp', () => {
    expect(validateEvidenceItem({ ...realEvidence, collected_at: 'not-a-date' }).success).toBe(
      false
    );
  });

  it('rejects a missing source', () => {
    const rest: Record<string, unknown> = { ...realEvidence };
    delete rest.source;
    expect(validateEvidenceItem(rest).success).toBe(false);
  });

  it('rejects secret-like pointer/value material', () => {
    expect(
      validateEvidenceItem({ ...realEvidence, value: 'sk-abcdefghijklmnopqrstuvwxyz' }).success
    ).toBe(false);
  });
});

describe('hasContractValidEvidence', () => {
  it('is false for an empty array', () => {
    expect(hasContractValidEvidence([])).toBe(false);
  });
  it('is false for a non-array', () => {
    expect(hasContractValidEvidence(undefined)).toBe(false);
  });
  it('is true when at least one item is valid', () => {
    expect(hasContractValidEvidence([{ pointer: 'unknown', source: 'x' }, realEvidence])).toBe(
      true
    );
  });
});

describe('FindingRuntimeSchema (via validateFinding)', () => {
  it('accepts a valid finding with one real evidence item', () => {
    expect(validateFinding(validFinding()).success).toBe(true);
  });

  it('rejects an empty evidence array (P1-09/P2-36)', () => {
    const result = validateFinding(validFinding({ evidence: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects a missing evidence field', () => {
    const f = validFinding();
    delete (f as Record<string, unknown>).evidence;
    expect(validateFinding(f).success).toBe(false);
  });

  it('rejects impactScore out of bounds', () => {
    expect(validateFinding(validFinding({ impactScore: 15 })).success).toBe(false);
    expect(validateFinding(validFinding({ impactScore: -1 })).success).toBe(false);
  });

  it('rejects a non-finite score', () => {
    expect(validateFinding(validFinding({ impactScore: Infinity })).success).toBe(false);
  });

  it('rejects an invalid finding type', () => {
    expect(validateFinding(validFinding({ type: 'NOT_A_TYPE' })).success).toBe(false);
  });

  it('rejects a non-substantive title', () => {
    expect(validateFinding(validFinding({ title: 'x' })).success).toBe(false);
  });

  it('rejects malformed evidence nested inside an otherwise-valid finding', () => {
    expect(
      validateFinding(
        validFinding({
          evidence: [{ pointer: 'unknown', source: 'x', collected_at: new Date().toISOString() }],
        })
      ).success
    ).toBe(false);
  });
});

describe('normalizeAndValidateModuleFindings (adapter/aggregation boundary, Step 5)', () => {
  it('accepts findings from a COMPLETE module and trusts the injected module id', () => {
    const { accepted, rejected } = normalizeAndValidateModuleFindings('techStack', 'COMPLETE', [
      validFinding({ module: 'some-other-module-claim' }),
    ]);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
    // Trusted identity always wins over module-authored output (Step 3 requirement 4).
    expect(accepted[0].module).toBe('techStack');
  });

  it('accepts findings from a PARTIAL module', () => {
    const { accepted } = normalizeAndValidateModuleFindings('techStack', 'PARTIAL', [
      validFinding(),
    ]);
    expect(accepted).toHaveLength(1);
  });

  it('rejects ALL findings from a FAILED module, even shape-valid ones (Step 8)', () => {
    const { accepted, rejected } = normalizeAndValidateModuleFindings('gbp', 'FAILED', [
      validFinding(),
    ]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/not eligible/);
  });

  it('rejects ALL findings from a SKIPPED module', () => {
    const { accepted } = normalizeAndValidateModuleFindings('gbp', 'SKIPPED', [validFinding()]);
    expect(accepted).toEqual([]);
  });

  it('rejects a finding with evidence: [] from an otherwise-COMPLETE module (P2-36 regression fixture)', () => {
    const { accepted, rejected } = normalizeAndValidateModuleFindings('mobileUX', 'COMPLETE', [
      validFinding({ evidence: [] }),
    ]);
    expect(accepted).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].issues.join(' ')).toMatch(/evidence/);
  });

  it('does not repair invalid output by injecting fabricated evidence', () => {
    const { accepted } = normalizeAndValidateModuleFindings('mobileUX', 'COMPLETE', [
      validFinding({ evidence: [] }),
    ]);
    // The rejected finding must not reappear with evidence attached.
    expect(accepted.some((f) => f.title === 'Modern Technology Stack')).toBe(false);
  });
});

describe('validateFindingForPersistence (Step 6 — final revalidation before write)', () => {
  it('accepts a valid finding and injects trusted identity', () => {
    const result = validateFindingForPersistence(validFinding(), {
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      moduleName: 'techStack',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed finding at final persistence revalidation', () => {
    const result = validateFindingForPersistence(validFinding({ evidence: [] }), {
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      moduleName: 'techStack',
    });
    expect(result.ok).toBe(false);
  });

  it('overrides a module-claimed identity with the trusted moduleName', () => {
    const result = validateFindingForPersistence(validFinding({ module: 'attacker-module' }), {
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      moduleName: 'techStack',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.finding.module).toBe('techStack');
    }
  });

  it('throws if auditId/tenantId trusted identity is missing (Step 6 requirement 8-9)', () => {
    expect(() =>
      validateFindingForPersistence(validFinding(), {
        auditId: '',
        tenantId: 'tenant-1',
        moduleName: 'techStack',
      })
    ).toThrow();
  });
});
