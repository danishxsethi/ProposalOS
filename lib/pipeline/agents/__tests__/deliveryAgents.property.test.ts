import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  type DeliveryAgentType,
  DELIVERABLE_TYPE_TO_AGENT_TYPE,
  type DeliverableType,
  createDeliveryAgentTask,
  type AcceptedProposal,
} from '../deliveryAgentTaskFactory';

/**
 * Property 2: Delivery Agent Task Creation
 *
 * For any accepted proposal containing deliverables of a specific type
 * (website_redesign, gbp_optimization, paid_ads, social_media, reputation),
 * the system must create a corresponding DeliveryAgentTask with the correct
 * agentType within 5 minutes of acceptance.
 *
 * **Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 2: Delivery Agent Task Creation
 */
describe('Feature: sprint-5-6-integration-pilot, Property 2: Delivery Agent Task Creation', () => {
  // Arbitrary generator for deliverable types
  const deliverableTypeArb = fc.constantFrom<DeliverableType>(
    'website_redesign',
    'gbp_optimization',
    'paid_ads',
    'social_media',
    'reputation'
  );

  // Arbitrary generator for a single deliverable
  const deliverableArb = fc.record({
    id: fc.uuid(),
    type: deliverableTypeArb,
    description: fc.string({ minLength: 1, maxLength: 100 }),
  });

  // Arbitrary generator for an accepted proposal with at least one deliverable
  const acceptedProposalArb = fc.record({
    id: fc.uuid(),
    tenantId: fc.uuid(),
    clientId: fc.uuid(),
    acceptedAt: fc.date({ min: new Date(Date.now() - 60_000), max: new Date() }).filter(
      (d) => !isNaN(d.getTime())
    ),
    deliverables: fc.array(deliverableArb, { minLength: 1, maxLength: 10 }),
  });

  it('should create one DeliveryAgentTask per deliverable', () => {
    fc.assert(
      fc.property(acceptedProposalArb, (proposal: AcceptedProposal) => {
        const tasks = createDeliveryAgentTask(proposal);

        // One task per deliverable
        expect(tasks.length).toBe(proposal.deliverables.length);
      }),
      { numRuns: 100 }
    );
  });

  it('should assign the correct agentType for each deliverable type', () => {
    fc.assert(
      fc.property(acceptedProposalArb, (proposal: AcceptedProposal) => {
        const tasks = createDeliveryAgentTask(proposal);

        for (let i = 0; i < proposal.deliverables.length; i++) {
          const deliverable = proposal.deliverables[i];
          const task = tasks[i];

          const expectedAgentType: DeliveryAgentType =
            DELIVERABLE_TYPE_TO_AGENT_TYPE[deliverable.type];

          expect(task.agentType).toBe(expectedAgentType);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should set task status to queued on creation', () => {
    fc.assert(
      fc.property(acceptedProposalArb, (proposal: AcceptedProposal) => {
        const tasks = createDeliveryAgentTask(proposal);

        for (const task of tasks) {
          expect(task.status).toBe('queued');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should propagate tenantId and clientId from the proposal', () => {
    fc.assert(
      fc.property(acceptedProposalArb, (proposal: AcceptedProposal) => {
        const tasks = createDeliveryAgentTask(proposal);

        for (const task of tasks) {
          expect(task.tenantId).toBe(proposal.tenantId);
          expect(task.clientId).toBe(proposal.clientId);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should create tasks within 5 minutes of proposal acceptance', () => {
    fc.assert(
      fc.property(acceptedProposalArb, (proposal: AcceptedProposal) => {
        const beforeCreation = Date.now();
        const tasks = createDeliveryAgentTask(proposal);
        const afterCreation = Date.now();

        const fiveMinutesMs = 5 * 60 * 1000;

        for (const task of tasks) {
          const taskCreatedAt = new Date(task.createdAt).getTime();

          // Task must be created after proposal acceptance
          expect(taskCreatedAt).toBeGreaterThanOrEqual(proposal.acceptedAt.getTime());

          // Task creation timestamp must be within the test execution window
          expect(taskCreatedAt).toBeGreaterThanOrEqual(beforeCreation);
          expect(taskCreatedAt).toBeLessThanOrEqual(afterCreation);

          // The elapsed time from acceptance to task creation must be ≤ 5 minutes
          const elapsedMs = taskCreatedAt - proposal.acceptedAt.getTime();
          expect(elapsedMs).toBeLessThanOrEqual(fiveMinutesMs);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should cover all five DeliveryAgentType values in the mapping', () => {
    // Exhaustive check: every deliverable type maps to a valid agent type
    const allDeliverableTypes: DeliverableType[] = [
      'website_redesign',
      'gbp_optimization',
      'paid_ads',
      'social_media',
      'reputation',
    ];

    const expectedMapping: Record<DeliverableType, DeliveryAgentType> = {
      website_redesign: 'website_redesign',
      gbp_optimization: 'gbp_optimization',
      paid_ads: 'paid_ads',
      social_media: 'social_media',
      reputation: 'reputation',
    };

    for (const deliverableType of allDeliverableTypes) {
      expect(DELIVERABLE_TYPE_TO_AGENT_TYPE[deliverableType]).toBe(
        expectedMapping[deliverableType]
      );
    }
  });
});

import {
  WebsiteRedesignAgent,
  type RedesignConfig,
  type RedesignMockup,
} from '../websiteRedesignAgent';
import type { PlatformCredentials } from '../../../platform/types';

// ---------------------------------------------------------------------------
// Shared arbitraries for website redesign tests
// ---------------------------------------------------------------------------

const industryArb = fc.constantFrom(
  'restaurant',
  'plumber',
  'dentist',
  'law-firm',
  'gym',
  'retail',
  'consulting'
);

const styleArb = fc.constantFrom<'modern' | 'classic' | 'minimal' | 'bold'>(
  'modern',
  'classic',
  'minimal',
  'bold'
);

const layoutArb = fc.constantFrom<'single-page' | 'multi-page'>(
  'single-page',
  'multi-page'
);

const redesignConfigArb = fc.record({
  clientId: fc.uuid(),
  proposalId: fc.uuid(),
  deliverableId: fc.uuid(),
  existingSiteUrl: fc.constantFrom(
    'https://example.com',
    'https://mysite.wordpress.com',
    'https://store.shopify.com',
    'https://site.wix.com'
  ),
  industry: industryArb,
  designPreferences: fc.record({
    style: styleArb,
    layout: layoutArb,
  }),
});

const platformCredentialsArb = fc.record({
  platform: fc.constantFrom<'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'custom'>(
    'wordpress',
    'shopify',
    'wix',
    'squarespace',
    'custom'
  ),
  siteUrl: fc.constantFrom(
    'https://client-site.com',
    'https://mystore.shopify.com',
    'https://mybiz.wix.com'
  ),
});

// ---------------------------------------------------------------------------
// Property 3: Mockup Preview Before Deployment
//
// No mockup may transition to `deployed` without a valid `previewUrl`.
// Attempting to deploy a mockup that has not been through the preview/approval
// flow (i.e. status !== 'approved') must throw an error.
//
// **Validates: Requirements 1.2, 1.3**
// ---------------------------------------------------------------------------

/**
 * Property 3: Mockup Preview Before Deployment
 *
 * **Validates: Requirements 1.2, 1.3**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 3: Mockup Preview Before Deployment
 */
describe('Feature: sprint-5-6-integration-pilot, Property 3: Mockup Preview Before Deployment', () => {
  it('should throw when deploying a mockup that is not approved (draft status)', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        platformCredentialsArb,
        async (config: RedesignConfig, credentials: PlatformCredentials) => {
          const agent = new WebsiteRedesignAgent();

          // Generate a mockup — it starts in 'draft' status
          const mockup = await agent.generateMockup(config);
          expect(mockup.status).toBe('draft');

          // Attempting to deploy a draft mockup must throw
          await expect(
            agent.deployToProduction(mockup.id, credentials)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw when deploying a mockup in pending_approval status (preview exists but not approved)', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        platformCredentialsArb,
        async (config: RedesignConfig, credentials: PlatformCredentials) => {
          const agent = new WebsiteRedesignAgent();

          // Generate mockup and create preview (transitions to pending_approval)
          const mockup = await agent.generateMockup(config);
          await agent.createPreviewDeployment(mockup);

          const pending = agent.getMockup(mockup.id)!;
          expect(pending.status).toBe('pending_approval');
          expect(pending.previewUrl).toBeTruthy();

          // Still must not be deployable — not yet approved
          await expect(
            agent.deployToProduction(mockup.id, credentials)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should succeed when deploying an approved mockup that has a valid previewUrl', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        platformCredentialsArb,
        async (config: RedesignConfig, credentials: PlatformCredentials) => {
          const agent = new WebsiteRedesignAgent();

          // Full happy path: generate → preview → approve → deploy
          const mockup = await agent.generateMockup(config);
          await agent.createPreviewDeployment(mockup);
          agent.approveMockup(mockup.id);

          const approved = agent.getMockup(mockup.id)!;
          expect(approved.status).toBe('approved');
          expect(approved.previewUrl).toBeTruthy();

          const result = await agent.deployToProduction(mockup.id, credentials);
          expect(result.success).toBe(true);

          // Mockup must now be in 'deployed' status
          const deployed = agent.getMockup(mockup.id)!;
          expect(deployed.status).toBe('deployed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw when deploying a rejected mockup (no valid preview path)', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        platformCredentialsArb,
        fc.string({ minLength: 1, maxLength: 200 }),
        async (
          config: RedesignConfig,
          credentials: PlatformCredentials,
          feedback: string
        ) => {
          const agent = new WebsiteRedesignAgent();

          // Generate, preview, then reject
          const mockup = await agent.generateMockup(config);
          await agent.createPreviewDeployment(mockup);

          // Manually set to rejected by calling handleRejection
          const newMockup = await agent.handleRejection(mockup.id, feedback);

          // The original mockup is now rejected — cannot deploy it
          await expect(
            agent.deployToProduction(mockup.id, credentials)
          ).rejects.toThrow();

          // The new revision starts as draft — also cannot deploy without approval
          await expect(
            agent.deployToProduction(newMockup.id, credentials)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Rejection Triggers New Version
//
// Any rejected mockup must produce a new mockup with version = previous + 1.
//
// **Validates: Requirements 1.6**
// ---------------------------------------------------------------------------

/**
 * Property 4: Rejection Triggers New Version
 *
 * **Validates: Requirements 1.6**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 4: Rejection Triggers New Version
 */
describe('Feature: sprint-5-6-integration-pilot, Property 4: Rejection Triggers New Version', () => {
  it('should produce a new mockup with version = original.version + 1 on rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        fc.string({ minLength: 1, maxLength: 500 }),
        async (config: RedesignConfig, feedback: string) => {
          const agent = new WebsiteRedesignAgent();

          const original = await agent.generateMockup(config);
          await agent.createPreviewDeployment(original);

          const newMockup = await agent.handleRejection(original.id, feedback);

          expect(newMockup.version).toBe(original.version + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should mark the original mockup as rejected after handleRejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        fc.string({ minLength: 1, maxLength: 500 }),
        async (config: RedesignConfig, feedback: string) => {
          const agent = new WebsiteRedesignAgent();

          const original = await agent.generateMockup(config);
          await agent.createPreviewDeployment(original);

          await agent.handleRejection(original.id, feedback);

          const stored = agent.getMockup(original.id)!;
          expect(stored.status).toBe('rejected');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce a new mockup in draft status after rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        fc.string({ minLength: 1, maxLength: 500 }),
        async (config: RedesignConfig, feedback: string) => {
          const agent = new WebsiteRedesignAgent();

          const original = await agent.generateMockup(config);
          await agent.createPreviewDeployment(original);

          const newMockup = await agent.handleRejection(original.id, feedback);

          expect(newMockup.status).toBe('draft');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should increment version correctly across multiple rejection cycles', async () => {
    await fc.assert(
      fc.asyncProperty(
        redesignConfigArb,
        fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 1, maxLength: 5 }),
        async (config: RedesignConfig, feedbacks: string[]) => {
          const agent = new WebsiteRedesignAgent();

          let current = await agent.generateMockup(config);
          await agent.createPreviewDeployment(current);

          for (let i = 0; i < feedbacks.length; i++) {
            const previousVersion = current.version;
            const next = await agent.handleRejection(current.id, feedbacks[i]);

            expect(next.version).toBe(previousVersion + 1);

            // Prepare next iteration: create preview so it can be rejected again
            await agent.createPreviewDeployment(next);
            current = agent.getMockup(next.id)!;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { GBPOptimizationAgent } from '../gbpOptimizationAgent';

// ---------------------------------------------------------------------------
// Property 5: Negative Review Human Review Gate
//
// For any review with rating ≤ 3, the response must be flagged for human
// review and must NOT be auto-posted. For positive reviews (rating > 3),
// the response must be auto-posted and must NOT be flagged for human review.
//
// **Validates: Requirements 2.5, 2.6, 5.3, 5.4**
// Tag: Feature: sprint-5-6-integration-pilot, Property 5: Negative Review Human Review Gate
// ---------------------------------------------------------------------------

/**
 * Property 5: Negative Review Human Review Gate
 *
 * **Validates: Requirements 2.5, 2.6, 5.3, 5.4**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 5: Negative Review Human Review Gate
 */
describe('Feature: sprint-5-6-integration-pilot, Property 5: Negative Review Human Review Gate', () => {
  // Arbitrary for review IDs
  const reviewIdArb = fc.uuid();

  // Arbitrary for draft response text
  const draftResponseArb = fc.string({ minLength: 1, maxLength: 500 });

  it('negative sentiment: flaggedForReview must be true and autoPosted must be false', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewIdArb,
        draftResponseArb,
        async (reviewId: string, draftResponse: string) => {
          const agent = new GBPOptimizationAgent();

          const result = await agent.respondToReview(reviewId, 'negative', draftResponse);

          expect(result.flaggedForReview).toBe(true);
          expect(result.autoPosted).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('positive sentiment: autoPosted must be true and flaggedForReview must be false', async () => {
    await fc.assert(
      fc.asyncProperty(
        reviewIdArb,
        draftResponseArb,
        async (reviewId: string, draftResponse: string) => {
          const agent = new GBPOptimizationAgent();

          const result = await agent.respondToReview(reviewId, 'positive', draftResponse);

          expect(result.autoPosted).toBe(true);
          expect(result.flaggedForReview).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('response must preserve the reviewId and draftResponse regardless of sentiment', async () => {
    const sentimentArb = fc.constantFrom<'positive' | 'negative'>('positive', 'negative');

    await fc.assert(
      fc.asyncProperty(
        reviewIdArb,
        sentimentArb,
        draftResponseArb,
        async (reviewId: string, sentiment: 'positive' | 'negative', draftResponse: string) => {
          const agent = new GBPOptimizationAgent();

          const result = await agent.respondToReview(reviewId, sentiment, draftResponse);

          expect(result.reviewId).toBe(reviewId);
          expect(result.response).toBe(draftResponse);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('autoPosted and flaggedForReview must always be mutually exclusive', async () => {
    const sentimentArb = fc.constantFrom<'positive' | 'negative'>('positive', 'negative');

    await fc.assert(
      fc.asyncProperty(
        reviewIdArb,
        sentimentArb,
        draftResponseArb,
        async (reviewId: string, sentiment: 'positive' | 'negative', draftResponse: string) => {
          const agent = new GBPOptimizationAgent();

          const result = await agent.respondToReview(reviewId, sentiment, draftResponse);

          // Exactly one of the two flags must be true — never both, never neither
          expect(result.autoPosted !== result.flaggedForReview).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import {
  PaidAdsAgent,
  TIER_MONTHLY_BUDGET_LIMITS,
  type PaidAdsConfig,
  type PaidAdsTier,
} from '../paidAdsAgent';

// ---------------------------------------------------------------------------
// Property 6: Budget Tier Enforcement
//
// 6a: For any campaign created with any tier, campaign.budget.monthly must be
//     <= TIER_MONTHLY_BUDGET_LIMITS[tier]
// 6b: For any budget change exceeding the tier limit, requestBudgetApproval
//     must return requiresApproval=true
// 6c: For any budget change within the tier limit, requestBudgetApproval
//     must return requiresApproval=false
//
// **Validates: Requirements 3.2, 3.8**
// Tag: Feature: sprint-5-6-integration-pilot, Property 6: Budget Tier Enforcement
// ---------------------------------------------------------------------------

/**
 * Property 6: Budget Tier Enforcement
 *
 * **Validates: Requirements 3.2, 3.8**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 6: Budget Tier Enforcement
 */
describe('Feature: sprint-5-6-integration-pilot, Property 6: Budget Tier Enforcement', () => {
  const tierArb = fc.constantFrom<PaidAdsTier>('starter', 'growth', 'pro');

  // Generate a budget that may be above or below the tier limit
  const anyPositiveBudgetArb = fc.integer({ min: 1, max: 50000 });

  // Base config without tier/budget — those are generated separately
  const basePaidAdsConfigArb = fc.record({
    clientId: fc.uuid(),
    businessName: fc.string({ minLength: 1, maxLength: 50 }),
    industry: fc.constantFrom('plumber', 'dentist', 'restaurant', 'gym', 'retail'),
    serviceArea: fc.record({
      city: fc.constantFrom('Austin', 'Denver', 'Miami', 'Seattle', 'Chicago'),
      radius: fc.integer({ min: 5, max: 50 }),
    }),
    targetKeywords: fc.array(
      fc.string({ minLength: 3, maxLength: 30 }),
      { minLength: 1, maxLength: 5 }
    ),
    landingPageUrl: fc.constantFrom(
      'https://example.com',
      'https://mybusiness.com/landing',
      'https://service.local/contact'
    ),
  });

  // ---------------------------------------------------------------------------
  // Property 6a: createCampaign clamps budget to tier limit
  // ---------------------------------------------------------------------------
  it('6a: campaign.budget.monthly must be <= tier limit for any input budget', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        anyPositiveBudgetArb,
        async (base, tier: PaidAdsTier, monthlyBudget: number) => {
          const agent = new PaidAdsAgent();
          const config: PaidAdsConfig = { ...base, tier, monthlyBudget };

          const campaign = await agent.createCampaign(config);

          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];
          expect(campaign.budget.monthly).toBeLessThanOrEqual(tierLimit);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('6a: campaign.budget.monthly must equal min(requestedBudget, tierLimit)', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        anyPositiveBudgetArb,
        async (base, tier: PaidAdsTier, monthlyBudget: number) => {
          const agent = new PaidAdsAgent();
          const config: PaidAdsConfig = { ...base, tier, monthlyBudget };

          const campaign = await agent.createCampaign(config);

          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];
          const expectedBudget = Math.min(monthlyBudget, tierLimit);
          expect(campaign.budget.monthly).toBe(expectedBudget);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ---------------------------------------------------------------------------
  // Property 6b: requestBudgetApproval returns requiresApproval=true when
  //              newBudget > tierLimit
  // ---------------------------------------------------------------------------
  it('6b: requiresApproval must be true when newBudget exceeds tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        async (base, tier: PaidAdsTier) => {
          const agent = new PaidAdsAgent();
          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];

          // Create a campaign first (budget clamped to tier limit)
          const config: PaidAdsConfig = { ...base, tier, monthlyBudget: tierLimit };
          const campaign = await agent.createCampaign(config);

          // Request a budget that strictly exceeds the tier limit
          const exceedingBudget = tierLimit + 1;
          const approval = await agent.requestBudgetApproval(campaign.id, exceedingBudget);

          expect(approval.requiresApproval).toBe(true);
          expect(approval.status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('6b: requiresApproval=true for any budget strictly greater than tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        fc.integer({ min: 1, max: 40000 }),
        async (base, tier: PaidAdsTier, excess: number) => {
          const agent = new PaidAdsAgent();
          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];

          const config: PaidAdsConfig = { ...base, tier, monthlyBudget: tierLimit };
          const campaign = await agent.createCampaign(config);

          const exceedingBudget = tierLimit + excess;
          const approval = await agent.requestBudgetApproval(campaign.id, exceedingBudget);

          expect(approval.requiresApproval).toBe(true);
          expect(approval.requestedBudget).toBe(exceedingBudget);
          expect(approval.tierLimit).toBe(tierLimit);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ---------------------------------------------------------------------------
  // Property 6c: requestBudgetApproval returns requiresApproval=false when
  //              newBudget <= tierLimit
  // ---------------------------------------------------------------------------
  it('6c: requiresApproval must be false when newBudget is within tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        async (base, tier: PaidAdsTier) => {
          const agent = new PaidAdsAgent();
          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];

          const config: PaidAdsConfig = { ...base, tier, monthlyBudget: tierLimit };
          const campaign = await agent.createCampaign(config);

          // Request a budget exactly at the tier limit
          const approval = await agent.requestBudgetApproval(campaign.id, tierLimit);

          expect(approval.requiresApproval).toBe(false);
          expect(approval.status).toBe('approved');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('6c: requiresApproval=false for any budget <= tier limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        fc.integer({ min: 1, max: 10000 }),
        async (base, tier: PaidAdsTier, withinBudget: number) => {
          const agent = new PaidAdsAgent();
          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];

          // Clamp withinBudget to be <= tierLimit
          const newBudget = Math.min(withinBudget, tierLimit);

          const config: PaidAdsConfig = { ...base, tier, monthlyBudget: tierLimit };
          const campaign = await agent.createCampaign(config);

          const approval = await agent.requestBudgetApproval(campaign.id, newBudget);

          expect(approval.requiresApproval).toBe(false);
          expect(approval.status).toBe('approved');
        }
      ),
      { numRuns: 100 }
    );
  });

  // ---------------------------------------------------------------------------
  // Invariant: approval request always reflects the correct tier and limit
  // ---------------------------------------------------------------------------
  it('approval request must always carry the correct tier and tierLimit', async () => {
    await fc.assert(
      fc.asyncProperty(
        basePaidAdsConfigArb,
        tierArb,
        anyPositiveBudgetArb,
        async (base, tier: PaidAdsTier, newBudget: number) => {
          const agent = new PaidAdsAgent();
          const tierLimit = TIER_MONTHLY_BUDGET_LIMITS[tier];

          const config: PaidAdsConfig = { ...base, tier, monthlyBudget: tierLimit };
          const campaign = await agent.createCampaign(config);

          const approval = await agent.requestBudgetApproval(campaign.id, newBudget);

          expect(approval.tier).toBe(tier);
          expect(approval.tierLimit).toBe(tierLimit);
          expect(approval.campaignId).toBe(campaign.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import {
  SocialMediaAgent,
  type SocialMediaConfig,
  type SocialPlatform,
} from '../socialMediaAgent';

// ---------------------------------------------------------------------------
// Property 2b: Social Content Platform Match
//
// For any generated SocialPost, the platform field must match one of the
// valid platforms ('instagram', 'facebook', 'linkedin'), the caption must be
// a non-empty string, and the hashtags array must be non-empty.
//
// **Validates: Requirements 4.1, 4.2, 4.6**
// Tag: Feature: sprint-5-6-integration-pilot, Property 2b: Social Content Platform Match
// ---------------------------------------------------------------------------

/**
 * Property 2b: Social Content Platform Match
 *
 * **Validates: Requirements 4.1, 4.2, 4.6**
 * Tag: Feature: sprint-5-6-integration-pilot, Property 2b: Social Content Platform Match
 */
describe('Feature: sprint-5-6-integration-pilot, Property 2b: Social Content Platform Match', () => {
  const VALID_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'linkedin'];

  const platformArb = fc.constantFrom<SocialPlatform>(...VALID_PLATFORMS);

  const brandVoiceArb = fc.constantFrom<'professional' | 'friendly' | 'casual' | 'authoritative'>(
    'professional',
    'friendly',
    'casual',
    'authoritative'
  );

  const contentTypeArb = fc.constantFrom(
    'promotional',
    'educational',
    'behind-the-scenes',
    'testimonial',
    'community'
  );

  const socialMediaConfigArb = fc.record({
    clientId: fc.uuid(),
    businessName: fc.string({ minLength: 1, maxLength: 50 }),
    industry: fc.constantFrom('plumber', 'dentist', 'restaurant', 'gym', 'retail'),
    brandVoice: brandVoiceArb,
    platforms: fc.array(platformArb, { minLength: 1, maxLength: 3 }).map(
      (arr) => [...new Set(arr)] as SocialPlatform[]
    ),
    postingFrequency: fc.record({ postsPerWeek: fc.integer({ min: 1, max: 7 }) }),
    localMarket: fc.record({
      city: fc.constantFrom('Austin', 'Denver', 'Miami', 'Seattle', 'Chicago'),
      region: fc.constantFrom('TX', 'CO', 'FL', 'WA', 'IL'),
    }),
  });

  it('generated post platform must be one of instagram, facebook, or linkedin', async () => {
    await fc.assert(
      fc.asyncProperty(
        socialMediaConfigArb,
        platformArb,
        contentTypeArb,
        async (config: SocialMediaConfig, platform: SocialPlatform, contentType: string) => {
          const agent = new SocialMediaAgent();
          const post = await agent.generatePost(config, contentType, platform);

          expect(VALID_PLATFORMS).toContain(post.platform);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generated post platform must match the requested platform', async () => {
    await fc.assert(
      fc.asyncProperty(
        socialMediaConfigArb,
        platformArb,
        contentTypeArb,
        async (config: SocialMediaConfig, platform: SocialPlatform, contentType: string) => {
          const agent = new SocialMediaAgent();
          const post = await agent.generatePost(config, contentType, platform);

          expect(post.platform).toBe(platform);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generated post caption must be a non-empty string', async () => {
    await fc.assert(
      fc.asyncProperty(
        socialMediaConfigArb,
        platformArb,
        contentTypeArb,
        async (config: SocialMediaConfig, platform: SocialPlatform, contentType: string) => {
          const agent = new SocialMediaAgent();
          const post = await agent.generatePost(config, contentType, platform);

          expect(typeof post.caption).toBe('string');
          expect(post.caption.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('generated post hashtags must be a non-empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        socialMediaConfigArb,
        platformArb,
        contentTypeArb,
        async (config: SocialMediaConfig, platform: SocialPlatform, contentType: string) => {
          const agent = new SocialMediaAgent();
          const post = await agent.generatePost(config, contentType, platform);

          expect(Array.isArray(post.hashtags)).toBe(true);
          expect(post.hashtags.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three properties hold simultaneously for any platform and content type', async () => {
    await fc.assert(
      fc.asyncProperty(
        socialMediaConfigArb,
        platformArb,
        contentTypeArb,
        async (config: SocialMediaConfig, platform: SocialPlatform, contentType: string) => {
          const agent = new SocialMediaAgent();
          const post = await agent.generatePost(config, contentType, platform);

          // Platform match
          expect(VALID_PLATFORMS).toContain(post.platform);
          expect(post.platform).toBe(platform);

          // Non-empty caption
          expect(post.caption.length).toBeGreaterThan(0);

          // Non-empty hashtags
          expect(post.hashtags.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
