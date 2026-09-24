// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
import { buildProposalGrounding } from '@/lib/proposal/grounding';
import { prisma } from '@/lib/prisma';

// Mock prisma and logs
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      create: vi.fn(),
    },
    playbook: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  logError: vi.fn(),
}));

describe('Self-Serve Automated Onboarding & Operations Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    delete process.env.KILL_SWITCH_FORCE_MANUAL_MODE;
    delete process.env.AUTOMATION_AUTO_QA_PROMOTION;
    process.env.NODE_ENV = 'test';
  });

  // =================================================================--------
  // PART C: ProposalQAService & 7-Dimension Rubric Scoring
  // =================================================================--------
  describe('ProposalQAService Rubric & Auto-Promotion Gating', () => {
    // Trust-foundation fixture (Wave 3+): every finding a proposal cites must satisfy
    // the runtime Finding contract (lib/audit/findingContract.ts): category, type,
    // confidenceScore, metrics, effortEstimate, recommendedFix, and evidence with a
    // real, non-placeholder pointer AND source. QA scores evidenceQuality/relevance/
    // specificity/clarity/clientReadiness as 0 when these foundations are missing,
    // and autoQA hard-fails on ungrounded proposals — that blocking behavior is the
    // security control under test, so the "perfect" fixture must clear it honestly.
    const makeFinding = (
      id: string,
      module: string,
      category: string,
      title: string,
      impactScore: number,
      pointer: string,
      source: string,
      value: number | string,
      label: string
    ) =>
      ({
        id,
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        module,
        category,
        type: 'PAINKILLER',
        title,
        description: `${title} was observed.`,
        impactScore,
        confidenceScore: 9,
        evidence: [
          {
            pointer,
            source,
            collected_at: '2026-05-30T00:00:00.000Z',
            type: 'metric',
            value,
            label,
          },
        ],
        metrics: { [label.toLowerCase()]: value },
        effortEstimate: 'MEDIUM',
        recommendedFix: [`Address ${title}`],
      }) as any;

    const dummyFindings = [
      makeFinding(
        'f1',
        'performance',
        'Performance',
        'Slow page speed',
        8,
        'https://acme.com/',
        'pagespeed_v5',
        4200,
        'LCP'
      ),
      makeFinding(
        'f2',
        'seo',
        'SEO',
        'Missing meta tags',
        7,
        'https://acme.com/head',
        'website_crawler',
        'missing title',
        'Meta'
      ),
      makeFinding(
        'f3',
        'security',
        'Security',
        'SSL missing',
        9,
        'https://acme.com/headers',
        'security_scan',
        'missing hsts',
        'SSL'
      ),
      makeFinding(
        'f4',
        'links',
        'Links',
        'Broken links',
        6,
        'https://acme.com/sitemap',
        'link_crawler',
        3,
        'links'
      ),
    ] as any[];

    const makeTier = (
      name: string,
      findingIds: string[],
      titles: string[],
      deliveryTime: string,
      price: number,
      monthlyValue: number
    ) => ({
      name,
      description: `Addresses: ${titles.join('; ')}`,
      features: titles.map((t) => `Address ${t}`),
      findingIds,
      deliveryTime,
      price,
      roi: {
        monthlyValue,
        ratio: Number((monthlyValue / price).toFixed(1)),
        scenarios: {
          best: monthlyValue * 2,
          base: monthlyValue,
          worst: Math.round(monthlyValue / 5),
          assumptions: ['Access granted', 'No blockers'],
        },
      },
    });

    const buildPerfectProposal = () => {
      const proposal = {
        executiveSummary:
          'Acme Corporation: Slow page speed, Missing meta tags, SSL missing and Broken links were observed and are addressed below.',
        painClusters: [
          {
            id: 'cluster-1',
            rootCause: 'Slow page speed; Missing meta tags',
            severity: 'critical' as const,
            findingIds: ['f1', 'f2'],
          },
        ],
        topActions: [
          {
            findingId: 'f1',
            title: 'Slow page speed',
            impact: 8,
            effort: 'MEDIUM',
            timeline: '14 days',
          },
          {
            findingId: 'f2',
            title: 'Missing meta tags',
            impact: 7,
            effort: 'LOW',
            timeline: '7 days',
          },
          {
            findingId: 'f3',
            title: 'SSL missing',
            impact: 9,
            effort: 'LOW',
            timeline: '3 days',
          },
        ],
        tiers: {
          essentials: makeTier(
            'Essentials',
            ['f1', 'f2'],
            ['Slow page speed', 'Missing meta tags'],
            '5 days',
            1000,
            2500
          ),
          growth: makeTier(
            'Growth',
            ['f1', 'f2', 'f3'],
            ['Slow page speed', 'Missing meta tags', 'SSL missing'],
            '10 days',
            2500,
            6250
          ),
          premium: makeTier(
            'Premium',
            ['f1', 'f2', 'f3', 'f4'],
            ['Slow page speed', 'Missing meta tags', 'SSL missing', 'Broken links'],
            '15 days',
            4000,
            10000
          ),
        },
        pricing: { essentials: 1000, growth: 2500, premium: 4000, currency: 'USD' },
        assumptions: ['Prerequisites satisfied.', 'AdWords configured.'],
        disclaimers: ['Normal variance.'],
        nextSteps: [
          'Apply impact: high effort: low timeline: immediate structure here.',
          'Apply impact: high effort: med timeline: month structure here.',
          'Apply impact: high effort: high timeline: quarter structure here.',
          'Reply or schedule to book your kick-off session!',
        ],
      } as any;
      proposal.grounding = buildProposalGrounding(
        proposal,
        { auditId: 'audit-1', tenantId: 'tenant-1', findings: dummyFindings },
        ['f1', 'f2', 'f3', 'f4']
      );
      return proposal;
    };

    const perfectProposal = buildPerfectProposal();

    it('should pass and auto-promote if overallScore >= 7.5 and all dimensions >= 7.0', () => {
      const evaluation = ProposalQAService.evaluateProposal(
        perfectProposal,
        dummyFindings,
        'Acme Corporation',
        'Regina',
        { industry: 'software', businessUrl: 'https://acme.com' }
      );

      expect(evaluation.overallScore).toBeGreaterThanOrEqual(7.5);
      expect(evaluation.dimensions.evidenceQuality).toBe(10);
      expect(evaluation.dimensions.relevance).toBe(10);
      expect(evaluation.dimensions.specificity).toBe(10);
      expect(evaluation.dimensions.clarity).toBe(10);
      expect(evaluation.dimensions.pricingFit).toBe(10);
      expect(evaluation.dimensions.copywritingSafety).toBe(10);
      expect(evaluation.dimensions.clientReadiness).toBe(10);
      expect(evaluation.passed).toBe(true);
      expect(evaluation.feedbackLogs).toHaveLength(0);
    });

    it('should fail and block auto-promotion if a dimension (clarity) is below 7.0', () => {
      const badClarityProposal = {
        ...perfectProposal,
        nextSteps: ['No structure', 'No clear CTA'],
      };

      const evaluation = ProposalQAService.evaluateProposal(
        badClarityProposal,
        dummyFindings,
        'Acme Corporation',
        'Regina',
        { industry: 'software', businessUrl: 'https://acme.com' }
      );

      expect(evaluation.dimensions.clarity).toBeLessThan(7.0);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.feedbackLogs.some((log) => log.includes('clarity score'))).toBe(true);
    });

    it('should fail copywritingSafety if non-profit organization proposal contains commercial SEO buzzwords', () => {
      const nonprofitLeakageProposal = {
        ...perfectProposal,
        executiveSummary:
          perfectProposal.executiveSummary +
          ' We will optimize your Google Business Profile and local map pack to secure local citations!',
      };

      const evaluation = ProposalQAService.evaluateProposal(
        nonprofitLeakageProposal,
        dummyFindings,
        'The Free Software Foundation',
        'Boston',
        { industry: 'non-profit', businessUrl: 'https://gnu.org' }
      );

      expect(evaluation.dimensions.copywritingSafety).toBeLessThan(7.0); // Bypasses safety
      expect(evaluation.passed).toBe(false);
      expect(
        evaluation.feedbackLogs.some((log) =>
          log.includes('Safety check failed: Non-profit targets')
        )
      ).toBe(true);
    });

    it('should bypass promotion if KILL_SWITCH_FORCE_MANUAL_MODE is active', () => {
      process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'true';

      const evaluation = ProposalQAService.evaluateProposal(
        perfectProposal,
        dummyFindings,
        'Acme Corporation',
        'Regina',
        { industry: 'software', businessUrl: 'https://acme.com' }
      );

      expect(evaluation.passed).toBe(false);
      expect(evaluation.feedbackLogs).toContain(
        'System is in force manual review mode (KILL_SWITCH_FORCE_MANUAL_MODE=true). Promotion bypassed.'
      );
    });

    it('should bypass promotion if AUTOMATION_AUTO_QA_PROMOTION is false', () => {
      process.env.AUTOMATION_AUTO_QA_PROMOTION = 'false';

      const evaluation = ProposalQAService.evaluateProposal(
        perfectProposal,
        dummyFindings,
        'Acme Corporation',
        'Regina',
        { industry: 'software', businessUrl: 'https://acme.com' }
      );

      expect(evaluation.passed).toBe(false);
      expect(evaluation.feedbackLogs).toContain(
        'Automated QA promotion is disabled (AUTOMATION_AUTO_QA_PROMOTION=false). Promotion bypassed.'
      );
    });
  });

  // =================================================================--------
  // PART D: Stripe pre-flight key assertion check on boot
  // =================================================================--------
  describe('Stripe Boot Environment & Key Assertions', () => {
    it('should boot and resolve stripe secret key when using test credentials in non-production', async () => {
      process.env.NODE_ENV = 'development';
      process.env.STRIPE_SECRET_KEY = 'sk_test_12345';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_12345';

      const { stripeSecretKey } = await import('@/lib/stripe/stripe');
      expect(stripeSecretKey()).toBe('sk_test_12345');
    });

    it('should throw a fatal error when sk_live_ is detected in development or test environment', async () => {
      process.env.NODE_ENV = 'development';
      process.env.STRIPE_SECRET_KEY = 'sk_live_vulnerable_key_12345';

      // Reload module/trigger verification
      const { stripeSecretKey } = await import('@/lib/stripe/stripe');
      expect(() => stripeSecretKey()).toThrow(
        /Live Stripe keys detected in a non-production environment/
      );
    });

    it('should throw a fatal error when pk_live_ is detected in development or test environment', async () => {
      process.env.NODE_ENV = 'development';
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_some_secret_leak_12345';
      process.env.STRIPE_SECRET_KEY = 'sk_test_12345';

      const { stripeSecretKey } = await import('@/lib/stripe/stripe');
      expect(() => stripeSecretKey()).toThrow(
        /Live Stripe keys detected in a non-production environment/
      );
    });
  });
});
