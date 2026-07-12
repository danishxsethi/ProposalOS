import { describe, expect, it } from 'vitest';

import { createEvidence } from '@/lib/modules/types';
import { runAutoQA } from '@/lib/qa/autoQA';

import { buildProposalGrounding, validateProposalGrounding } from '../grounding';
import { runProposalPipeline, timelineByEffort } from '../index';
import { applyAuthorizedDiscount, getDynamicPricing } from '../pricing';
import {
  buildPersistedQaResults,
  publicationBlockReasons,
  publicProposalCitations,
} from '../publication';
import { calculateExplicitROI } from '../roiCalculator';

function finding(id: string, title: string, impactScore: number, overrides = {}) {
  return {
    id,
    auditId: 'audit-1',
    tenantId: 'tenant-1',
    module: 'website',
    category: 'Performance',
    type: impactScore >= 8 ? 'PAINKILLER' : 'VITAMIN',
    title,
    description: `${title} was observed in the bounded audit.`,
    impactScore,
    confidenceScore: 9,
    evidence: [
      createEvidence({
        pointer: `https://acme.test/${id}`,
        source: 'website_crawler',
        type: 'text',
        value: title,
        label: title,
      }),
    ],
    metrics: {},
    effortEstimate: impactScore >= 9 ? 'HIGH' : impactScore >= 7 ? 'MEDIUM' : 'LOW',
    recommendedFix: [`Address ${title}`],
    manuallyEdited: false,
    excluded: false,
    confidenceLevel: null,
    createdAt: new Date(),
    ...overrides,
  } as any;
}

const findings = [
  finding('finding-1', 'Slow page delivery', 9),
  finding('finding-2', 'Missing page titles', 8),
  finding('finding-3', 'Broken contact link', 7),
];

async function groundedProposal() {
  const cluster = {
    id: 'cluster-1',
    rootCause: findings.map((item) => item.title).join('; '),
    severity: 'critical' as const,
    findingIds: findings.map((item) => item.id),
  };
  return runProposalPipeline('Acme', 'general', [cluster], findings);
}

describe('Wave 8B proposal grounding and commercial logic', () => {
  it('builds and validates a fully cited proposal', async () => {
    const proposal = await groundedProposal();
    const validation = validateProposalGrounding(proposal, {
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      findings,
    });

    expect(validation.valid).toBe(true);
    expect(proposal.grounding?.claims.length).toBeGreaterThan(0);
    expect(proposal.grounding?.commercial.roiStatus).toBe('unavailable');
  });

  it.each([
    ['missing grounding', (proposal: any) => delete proposal.grounding],
    ['cross-audit grounding', (proposal: any) => (proposal.grounding.auditId = 'audit-2')],
    ['cross-tenant grounding', (proposal: any) => (proposal.grounding.tenantId = 'tenant-2')],
    [
      'unknown citation',
      (proposal: any) => (proposal.grounding.claims[0].sourceFindingIds = ['x']),
    ],
    [
      'unsupported claim',
      (proposal: any) => (proposal.grounding.claims[0].text = 'Revenue increased 72 percent'),
    ],
    ['price override', (proposal: any) => (proposal.tiers.essentials.price += 1)],
  ])('rejects %s', async (_name, mutate) => {
    const proposal = await groundedProposal();
    mutate(proposal);

    expect(
      validateProposalGrounding(proposal, {
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        findings,
      }).valid
    ).toBe(false);
  });

  it('rejects invalid Finding evidence instead of attaching a replacement citation', async () => {
    const proposal = await groundedProposal();
    const invalid = findings.map((item, index) => (index === 0 ? { ...item, evidence: [] } : item));

    expect(
      validateProposalGrounding(proposal, {
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        findings: invalid,
      }).errors.some((error) => error.includes('Wave 3 contract'))
    ).toBe(true);
  });

  it('uses validated deterministic pricing, discounts, timelines, and ROI arithmetic', () => {
    expect(getDynamicPricing({ industry: 'general', employeeCount: 10 })).toEqual({
      starter: 397,
      growth: 1197,
      premium: 2397,
    });
    expect(() => getDynamicPricing({ industry: 'general', employeeCount: -1 })).toThrow();
    expect(
      applyAuthorizedDiscount({ price: 1000, discountPercent: 10, authorizedMaxPercent: 15 })
    ).toBe(900);
    expect(() =>
      applyAuthorizedDiscount({ price: 1000, discountPercent: 20, authorizedMaxPercent: 15 })
    ).toThrow('authorized maximum');
    expect(timelineByEffort('LOW')).toBe('7 days');
    expect(timelineByEffort('MEDIUM')).toBe('14-21 days');
    expect(timelineByEffort('HIGH')).toBe('30-45 days');

    expect(
      calculateExplicitROI({
        price: 1000,
        monthlyBenefit: 250,
        currency: 'USD',
        assumptions: ['Monthly benefit confirmed by the customer'],
        inputSources: [
          { name: 'price', source: 'configured' },
          { name: 'monthlyBenefit', source: 'assumption' },
        ],
      })
    ).toMatchObject({ monthlyRatio: 0.25, paybackMonths: 4 });
    expect(() =>
      calculateExplicitROI({
        price: 0,
        monthlyBenefit: 250,
        currency: 'USD',
        assumptions: ['Confirmed'],
        inputSources: [
          { name: 'price', source: 'configured' },
          { name: 'monthlyBenefit', source: 'assumption' },
        ],
      })
    ).toThrow();
  });

  it('persists citations and blocks legacy or failed-QA publication', async () => {
    const proposal = await groundedProposal();
    const qa = runAutoQA(proposal, findings, 'Acme', null);
    const evaluation = {
      passed: qa.clientPerfect.hardFails.length === 0,
      dimensions: {},
      overallScore: qa.score,
      feedbackLogs: [],
      autoQAStatus: qa,
    };
    const qaResults = buildPersistedQaResults(evaluation, proposal);

    expect(publicProposalCitations(qaResults).status).toBe('verified');
    expect(
      publicationBlockReasons({
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        qaResults,
      })
    ).toEqual([]);
    expect(
      publicationBlockReasons({
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        qaResults: {},
      })
    ).toContain('Proposal is legacy/unverified or has invalid grounding metadata');
    expect(
      publicationBlockReasons({
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        qaResults: {
          ...qaResults,
          evaluation: { passed: false },
        },
      })
    ).toContain('Proposal QA has not passed');
  });

  it('QA rejects policy overclaims and ROI arithmetic mismatch without inventing citations', async () => {
    const proposal = await groundedProposal();
    proposal.disclaimers.push('This is WCAG AA compliant.');
    proposal.tiers.essentials.roi = {
      monthlyValue: 1000,
      ratio: 99,
      scenarios: { best: 1000, base: 900, worst: 800, assumptions: ['A', 'B'] },
    };
    proposal.grounding = buildProposalGrounding(
      proposal,
      { auditId: 'audit-1', tenantId: 'tenant-1', findings },
      findings.map((item) => item.id)
    );

    const result = runAutoQA(proposal, findings, 'Acme', null);

    expect(result.clientPerfect.hardFails.map((item) => item.code)).toEqual(
      expect.arrayContaining(['CLAIM_POLICY_VIOLATION', 'COMMERCIAL_LOGIC_INVALID'])
    );
    expect(
      proposal.grounding.claims.every((claim) =>
        claim.sourceFindingIds.every((id) => findings.some((finding) => finding.id === id))
      )
    ).toBe(true);
  });
});
