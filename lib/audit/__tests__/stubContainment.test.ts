/**
 * Wave 5 (Step 13) — stub/missing-module containment.
 *
 * `socialDeep` (lib/modules/socialDeep.ts) is a known stub: `analyzeProfile()` always
 * sets `exists: true` without any real verification, and the "No Active Social
 * Presence" fallback fabricates a customer-negative PAINKILLER finding with
 * `evidence: []` whenever no `discoveredUrls` were forwarded. This is a real
 * module-implementation defect (assigned to Wave 6 / P0-25), not an adapter/integration
 * defect — Wave 5 does not rebuild it. This test proves the existing Wave 3 Finding
 * contract boundary (`normalizeAndValidateModuleFindings`) already prevents that
 * fabricated, zero-evidence finding from reaching the customer, so the invalid
 * implementation cannot masquerade as a successful, trustworthy observation while it
 * remains unfixed.
 */
import { describe, expect, it } from 'vitest';

import { normalizeAndValidateModuleFindings } from '../findingContract';

describe('P0-25 containment (Wave 6 scope): socialDeep stub cannot emit a customer-negative finding', () => {
  it('rejects the "No Active Social Presence" finding shape socialDeep currently fabricates with evidence: []', () => {
    const stubbedSocialDeepFinding = {
      module: 'socialDeep',
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'No Active Social Presence',
      description:
        'We could not find any active social media profiles. In 2026, social proof is critical for trust.',
      impactScore: 8,
      confidenceScore: 9,
      evidence: [], // exactly what the current stubbed implementation produces
      metrics: { activeCount: 0 },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Claim operational profiles', 'Post at least once a week'],
    };

    const { accepted, rejected } = normalizeAndValidateModuleFindings('socialDeep', 'COMPLETE', [
      stubbedSocialDeepFinding,
    ]);

    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('schema validation failed');
    expect(rejected[0].issues.some((i) => i.includes('evidence'))).toBe(true);
  });

  it('would accept the same finding shape if socialDeep is ever fixed to attach real evidence (proves the boundary is the contract, not a blanket module ban)', () => {
    const fixedFinding = {
      module: 'socialDeep',
      type: 'PAINKILLER',
      category: 'Visibility',
      title: 'No Active Social Presence',
      impactScore: 8,
      confidenceScore: 9,
      evidence: [
        {
          pointer: 'https://serpapi.com/search?q=site:facebook.com...',
          source: 'social_deep_serp_search',
          collected_at: new Date().toISOString(),
        },
      ],
      metrics: { activeCount: 0 },
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Claim operational profiles'],
    };

    const { accepted, rejected } = normalizeAndValidateModuleFindings('socialDeep', 'COMPLETE', [
      fixedFinding,
    ]);

    expect(rejected).toHaveLength(0);
    expect(accepted).toHaveLength(1);
  });
});
