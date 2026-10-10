// @vitest-environment node
/**
 * lib/proposal/__tests__/financial-claims.test.ts
 *
 * Regression qualification for the customer-facing financial-claim gate
 * (lib/proposal/financialClaims.ts + the conversion view model).
 *
 * The joined journey surfaced that the proposal page/PDF asserted a definitive
 * "$X/mo lost" headline built from heuristic visitor estimates
 * (reviewCount x 150), industry benchmark conversion rates, and — worst —
 * invented severity "floors" ($650/$350/$150/$75 minimum monthly losses) plus
 * fabricated fallback findings with invented dollar values and evidence.
 *
 * These tests pin the corrected behavior:
 *   1. No observed traffic/conversion/revenue inputs -> NO customer-facing
 *      dollar claims anywhere in the conversion model.
 *   2. Observed evidence (finding counts, severity, competitor rank) is
 *      preserved and used for the headline/KPIs instead.
 *   3. With (future) observed inputs the gate opens, dollars appear, labeled
 *      as modeled estimates with documented inputs/assumptions.
 *   4. No fabricated findings ever; no invented severity floors.
 */
import { describe, expect, it } from 'vitest';

import { assessRevenueImpact, extractRevenueImpactInputs } from '@/lib/proposal/financialClaims';
import { buildProposalConversionModel } from '@/lib/proposal/conversionViewModel';

const baseAudit = (overrides: Record<string, unknown> = {}) => ({
  businessName: 'Summit Ridge Heating & Air',
  businessCity: 'Denver',
  businessIndustry: 'hvac',
  findings: [
    {
      id: 'f-1',
      type: 'PAINKILLER',
      impactScore: 9,
      title: 'Competitors have 343 more reviews on average',
      description: 'Top local competitors lead in review volume.',
      recommendedFix: 'Deploy automated review request flow.',
      evidence: [
        { type: 'metric', value: 343, pointer: 'https://fixture.test/gbp', label: 'Review gap' },
      ],
    },
    {
      id: 'f-2',
      type: 'VITAMIN',
      impactScore: 4,
      title: 'Homepage meta description missing',
      description: 'Search snippets fall back to extracted text.',
      recommendedFix: 'Write a meta description.',
      evidence: [
        {
          type: 'text',
          value: 'meta description absent',
          pointer: 'https://fixture.test/',
          label: 'Head tag',
        },
      ],
    },
  ],
  ...overrides,
});

const baseProposal = (auditOverrides: Record<string, unknown> = {}) => ({
  id: 'p-1',
  webLinkToken: 'token-1',
  createdAt: new Date('2026-10-10T00:00:00Z'),
  pricing: { essentials: 797, growth: 2497, premium: 4997 },
  audit: baseAudit(auditOverrides),
});

describe('revenue impact gate (lib/proposal/financialClaims.ts)', () => {
  it('treats audits without observed traffic/conversion/revenue inputs as unsupported', () => {
    const assessment = assessRevenueImpact(baseAudit());
    expect(assessment.supported).toBe(false);
    expect(assessment.observedInputs).toEqual([]);
    expect(assessment.assumptions.length).toBeGreaterThan(0);
  });

  it('stays unsupported with only partial observed inputs (traffic alone is not defensible)', () => {
    const assessment = assessRevenueImpact(baseAudit({ observedMonthlyVisitors: 900 }));
    expect(assessment.supported).toBe(false);
    expect(assessment.observedInputs).toContain('Observed monthly traffic: 900');
  });

  it('opens with observed traffic + conversion rate + order value', () => {
    const assessment = assessRevenueImpact(
      baseAudit({
        observedMonthlyVisitors: 900,
        observedConversionRate: 0.03,
        observedAverageOrderValue: 450,
      })
    );
    expect(assessment.supported).toBe(true);
    expect(assessment.observedInputs).toHaveLength(3);
  });

  it('opens with observed traffic + customer-stated revenue', () => {
    const assessment = assessRevenueImpact(
      baseAudit({
        observedMonthlyVisitors: 900,
        customerStatedMonthlyRevenue: 40000,
      })
    );
    expect(assessment.supported).toBe(true);
  });

  it('ignores zero, negative, and non-numeric inputs (fail closed)', () => {
    const inputs = extractRevenueImpactInputs({
      observedMonthlyVisitors: 0,
      observedConversionRate: -0.2,
      observedAverageOrderValue: 'many',
      customerStatedMonthlyRevenue: Number.NaN,
    });
    expect(inputs.observedMonthlyVisitors).toBeNull();
    expect(inputs.observedConversionRate).toBeNull();
    expect(inputs.observedAverageOrderValue).toBeNull();
    expect(inputs.customerStatedMonthlyRevenue).toBeNull();
    expect(assessRevenueImpact({ ...inputs }).supported).toBe(false);
  });
});

describe('conversion view model financial claims', () => {
  it('suppresses every customer-facing dollar claim when inputs are unobserved', () => {
    const model = buildProposalConversionModel(baseProposal());

    expect(model.revenueImpact.supported).toBe(false);

    // Headline: observed evidence, no dollar figure, no "losing" claim.
    expect(model.hookHeader.headline).toContain('verified issues');
    expect(model.hookHeader.headline).not.toMatch(/\$[\d,]/);
    expect(model.hookHeader.headline).not.toMatch(/losing/i);

    // KPI money strings suppressed.
    expect(model.hookHeader.totalMonthlyBleedFormatted).toBeNull();
    expect(model.hookHeader.totalAnnualBleedFormatted).toBeNull();
    expect(model.hookHeader.primaryProblemLossFormatted).toBeNull();

    // Executive summary: no dollar claims.
    expect(model.executiveSummary.overview).not.toMatch(/\$[\d,]/);

    // Findings: internal modeled ranking survives, dollar strings suppressed.
    for (const finding of model.rankedFindings) {
      expect(finding.monthlyDollarFormatted).toBeNull();
      expect(typeof finding.modeledMonthlyImpact).toBe('number');
    }
    for (const point of model.executiveSummary.topThreePoints) {
      expect(point.monthlyLossFormatted).toBeNull();
    }

    // Tiers: price kept, invented ROI/payback suppressed.
    for (const tier of model.pricingTiers) {
      expect(tier.priceFormatted).toMatch(/\$/);
      expect(tier.monthlyRoiFormatted).toBeNull();
      expect(tier.roiPaybackDays).toBeNull();
    }
  });

  it('preserves observed evidence in KPIs and finding details', () => {
    const model = buildProposalConversionModel(baseProposal());
    expect(model.evidenceKpis.length).toBeGreaterThanOrEqual(2);
    expect(model.evidenceKpis[0].value).toBe('2'); // two verified findings
    expect(model.rankedFindings[0].evidenceSnippets.length).toBeGreaterThan(0);
    expect(model.rankedFindings.some((f) => f.severity === 'Critical')).toBe(true);
  });

  it('does not invent severity floors (modeled value equals the raw ROI model output)', async () => {
    const lowFinding = {
      id: 'f-low',
      type: 'VITAMIN',
      impactScore: 2,
      title: 'Minor formatting nit on the about page',
      description: 'Cosmetic formatting inconsistency.',
      recommendedFix: 'Normalize formatting.',
      evidence: [
        { type: 'text', value: 'observed', pointer: 'https://fixture.test/about', label: 'Page' },
      ],
    };
    const model = buildProposalConversionModel(baseProposal({ findings: [lowFinding] }));
    expect(model.rankedFindings).toHaveLength(1);
    expect(model.rankedFindings[0].severity).toBe('Low');
    // The old code applied invented floors (Low -> $75/mo minimum); the modeled
    // value must now be exactly what the ROI model computes — no severity floor.
    const { calculateFindingROI } = await import('@/lib/proposal/roiCalculator');
    const raw = calculateFindingROI(lowFinding as never, 'hvac', {
      findings: [lowFinding] as never,
    });
    expect(model.rankedFindings[0].modeledMonthlyImpact).toBe(
      Math.max(0, Math.round(raw.monthlyValue))
    );
  });

  it('never fabricates fallback findings for an empty audit', () => {
    const model = buildProposalConversionModel(baseProposal({ findings: [] }));
    expect(model.rankedFindings).toEqual([]);
    expect(model.quickWins).toEqual([]);
    expect(model.hookHeader.headline).toContain('0 verified issues');
    expect(model.hookHeader.primaryProblemTitle).toContain('No verified issues');
  });

  it('shows labeled modeled dollars when observed inputs exist', () => {
    const model = buildProposalConversionModel(
      baseProposal({
        observedMonthlyVisitors: 900,
        observedConversionRate: 0.03,
        observedAverageOrderValue: 450,
      })
    );
    expect(model.revenueImpact.supported).toBe(true);
    expect(model.hookHeader.headline).toMatch(/losing an estimated \$[\d,]+\/mo/);
    expect(model.hookHeader.totalMonthlyBleedFormatted).toMatch(/^\$[\d,]+\/mo$/);
    expect(model.revenueImpact.observedInputs.length).toBe(3);
    for (const finding of model.rankedFindings) {
      expect(finding.monthlyDollarFormatted).toMatch(/^\$[\d,]+$/);
    }
    for (const tier of model.pricingTiers) {
      expect(tier.monthlyRoiFormatted).toMatch(/^\$[\d,]+\/mo$/);
    }
  });
});
