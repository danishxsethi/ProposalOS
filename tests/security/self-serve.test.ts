// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
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
    const dummyFindings = [
      {
        id: 'f1',
        title: 'LCP bad',
        module: 'performance',
        impactScore: 8,
        evidence: [{ pointer: 'some-pointer', collected_at: '2026-05-30' }],
      },
      {
        id: 'f2',
        title: 'No SEO',
        module: 'seo',
        impactScore: 7,
        evidence: [{ pointer: 'some-pointer', collected_at: '2026-05-30' }],
      },
      {
        id: 'f3',
        title: 'SSL missing',
        module: 'security',
        impactScore: 9,
        evidence: [{ pointer: 'some-pointer', collected_at: '2026-05-30' }],
      },
      {
        id: 'f4',
        title: 'Broken links',
        module: 'links',
        impactScore: 6,
        evidence: [{ pointer: 'some-pointer', collected_at: '2026-05-30' }],
      },
    ] as any[];

    const perfectProposal = {
      executiveSummary:
        'This is a premium high-quality customized proposal for Acme Corporation in Regina software team. We analyzed your LCP of 4.5 seconds and identified 5 critical findings and 3 painkillers to save 12 hours of website performance issues, boosting your annual revenue!',
      tiers: {
        essentials: {
          name: 'Essentials',
          findingIds: ['f1', 'f2'],
          deliveryTime: '5 days',
          roi: {
            scenarios: {
              best: 10,
              base: 5,
              worst: 1,
              assumptions: ['Access granted', 'No blockers'],
            },
          },
        },
        growth: {
          name: 'Growth',
          findingIds: ['f1', 'f2', 'f3'],
          deliveryTime: '10 days',
          roi: {
            scenarios: {
              best: 20,
              base: 10,
              worst: 2,
              assumptions: ['Access granted', 'No blockers'],
            },
          },
        },
        premium: {
          name: 'Premium',
          findingIds: ['f1', 'f2', 'f3', 'f4'],
          deliveryTime: '15 days',
          roi: {
            scenarios: {
              best: 35,
              base: 18,
              worst: 5,
              assumptions: ['Access granted', 'No blockers'],
            },
          },
        },
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
