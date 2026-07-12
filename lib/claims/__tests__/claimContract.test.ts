import { describe, expect, it } from 'vitest';

import { createEvidence } from '@/lib/modules/types';

import { validateCustomerClaim } from '../claimContract';

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finding-1',
    auditId: 'audit-1',
    tenantId: 'tenant-1',
    module: 'website',
    category: 'Performance',
    type: 'PAINKILLER',
    title: 'Slow page',
    description: 'The measured page load was slow.',
    impactScore: 8,
    confidenceScore: 9,
    evidence: [
      createEvidence({
        pointer: 'https://acme.test/',
        source: 'pagespeed_v5',
        type: 'metric',
        value: 4200,
        label: 'LCP (ms)',
      }),
    ],
    metrics: { lcpMs: 4200 },
    effortEstimate: 'MEDIUM',
    recommendedFix: ['Improve page delivery'],
    manuallyEdited: false,
    excluded: false,
    confidenceLevel: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const claim = {
  claimId: 'claim-1',
  text: 'The measured page had an LCP of 4200 ms.',
  claimType: 'DETERMINISTIC_OBSERVATION',
  sourceFindingIds: ['finding-1'],
  classification: 'deterministic',
  confidence: 0.9,
  assumptions: [],
  metricInputs: [{ name: 'lcp', value: 4200, unit: 'ms', sourceFindingId: 'finding-1' }],
  estimate: false,
  recommendation: false,
  provenance: { producer: 'test' },
};

describe('customer claim provenance contract', () => {
  it('accepts a same-audit, same-tenant claim backed by a Wave 3-valid Finding', () => {
    const result = validateCustomerClaim(claim, {
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      findings: [finding()],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.auditId).toBe('audit-1');
      expect(result.data.tenantId).toBe('tenant-1');
    }
  });

  it.each([
    ['missing citation', { sourceFindingIds: [] }, [finding()]],
    ['unknown citation', { sourceFindingIds: ['missing'] }, [finding()]],
    ['cross-audit citation', {}, [finding({ auditId: 'audit-2' })]],
    ['cross-tenant citation', {}, [finding({ tenantId: 'tenant-2' })]],
    ['invalid Finding Evidence', {}, [finding({ evidence: [] })]],
  ])('rejects %s', (_name, claimOverrides, findings) => {
    expect(
      validateCustomerClaim(
        { ...claim, ...claimOverrides },
        {
          auditId: 'audit-1',
          tenantId: 'tenant-1',
          findings,
        }
      ).success
    ).toBe(false);
  });

  it('requires assumptions and explicit metric inputs for estimates', () => {
    expect(
      validateCustomerClaim(
        {
          ...claim,
          claimType: 'ESTIMATE_WITH_ASSUMPTIONS',
          classification: 'derived',
          estimate: true,
          assumptions: [],
          metricInputs: [],
        },
        { auditId: 'audit-1', tenantId: 'tenant-1', findings: [finding()] }
      ).success
    ).toBe(false);
  });

  it('allows a pure recommendation without inventing a citation', () => {
    expect(
      validateCustomerClaim(
        {
          ...claim,
          claimType: 'RECOMMENDATION',
          sourceFindingIds: [],
          classification: 'derived',
          metricInputs: [],
          recommendation: true,
        },
        { auditId: 'audit-1', tenantId: 'tenant-1', findings: [] }
      ).success
    ).toBe(true);
  });

  it('rejects model-supplied audit and tenant identity fields', () => {
    expect(
      validateCustomerClaim(
        { ...claim, auditId: 'audit-2', tenantId: 'tenant-2' },
        { auditId: 'audit-1', tenantId: 'tenant-1', findings: [finding()] }
      ).success
    ).toBe(false);
  });
});
