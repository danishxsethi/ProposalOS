import { describe, expect, it } from 'vitest';

import { detectHallucinations } from '../schemas';
import type { ProposalResult } from '../types';

function finding(id: string, title: string, impactScore: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    auditId: 'audit-1',
    tenantId: 'tenant-1',
    module: 'website',
    category: 'Performance',
    type: impactScore >= 8 ? 'PAINKILLER' : 'VITAMIN',
    title,
    description: `${title} was observed in the bounded audit.`,
    evidence: [],
    metrics: {},
    impactScore,
    confidenceScore: 0.9,
    effortEstimate: 'MEDIUM',
    recommendedFix: 'Fix it',
    createdAt: new Date(),
    ...overrides,
  };
}

function proposal(overrides: Partial<ProposalResult> = {}): ProposalResult {
  return {
    executiveSummary: 'Example Corp page speed is slow.',
    painClusters: [],
    tiers: {
      essentials: { name: 'Essentials', description: 'Core fixes', features: ['Fix A'], deliveryTime: '2 weeks', price: 797, findingIds: [] },
      growth: { name: 'Growth', description: 'Growth fixes', features: ['Fix B'], deliveryTime: '4 weeks', price: 2497, findingIds: [] },
      premium: { name: 'Premium', description: 'Premium fixes', features: ['Fix C'], deliveryTime: '6 weeks', price: 4997, findingIds: [] },
    },
    pricing: { essentials: 797, growth: 2497, premium: 4997, currency: 'USD' },
    assumptions: ['Assumption'],
    disclaimers: ['Disclaimer'],
    nextSteps: ['Step 1'],
    ...overrides,
  };
}

describe('detectHallucinations', () => {
  it('does NOT hard-block a grounded natural-language summary', () => {
    const findings = [
      finding('f1', 'LCP is 13653ms (Poor)', 8),
      finding('f2', 'FCP is 6903ms (Poor)', 7),
      finding('f3', 'No Analytics Tools Detected', 6),
    ];

    // Natural-language summary citing real finding facts. Median-severity
    // phrase flags must not trip hasHallucinations.
    const summary =
      'Westend Dental has a poorly optimized Google Business Profile with no website link and only 2% completeness. ' +
      'Page speed is a major concern: LCP loads in 13.6 seconds while FCP takes 6.9 seconds. ' +
      'No analytics tools are detected, leaving the practice flying blind on visitor behavior.';

    const result = detectHallucinations(
      { ...proposal(), executiveSummary: summary },
      findings as unknown as Parameters<typeof detectHallucinations>[1]
    );

    expect(result.hasHallucinations).toBe(false);
  });

  it('HARD-blocks a fabricated high-severity statistic', () => {
    const findings = [finding('f1', 'Good site', 5)];
    const summary =
      'Analysis shows a 99% conversion uplift is guaranteed after implementation.';

    const result = detectHallucinations(
      { ...proposal(), executiveSummary: summary },
      findings as unknown as Parameters<typeof detectHallucinations>[1]
    );

    expect(result.hasHallucinations).toBe(true);
  });

  it('grounds numeric claims from finding title text (not only metrics)', () => {
    const findings = [
      finding('f1', 'LCP is 13653ms (Poor)', 8, { metrics: {} }),
    ];

    const summary = 'Example Corp has a high LCP of 13653ms which is poor.';

    const result = detectHallucinations(
      { ...proposal(), executiveSummary: summary },
      findings as unknown as Parameters<typeof detectHallucinations>[1]
    );

    // LCP metric-claim from title text should be supported, not high-severity.
    expect(result.hasHallucinations).toBe(false);
    expect(result.flaggedClaims.filter((c) => c.severity === 'high')).toHaveLength(0);
  });
});