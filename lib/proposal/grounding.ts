import { Finding } from '@prisma/client';
import { z } from 'zod';

import { validateCustomerClaim, ValidatedCustomerClaim } from '@/lib/claims/claimContract';

import type { ProposalResult, TierConfig } from './types';

const TIER_NAMES = ['essentials', 'growth', 'premium'] as const;
const COMMERCIAL_RULES = {
  pricing: 'proposal-pricing-v1',
  tiers: 'proposal-tier-mapping-v1',
  timeline: 'proposal-timeline-v1',
} as const;

const ClaimBindingSchema = z
  .object({
    executiveSummary: z.string().min(1),
    painClusters: z.array(
      z
        .object({
          clusterId: z.string().min(1),
          rootCause: z.string().min(1),
          narrative: z.string().min(1).optional(),
        })
        .strict()
    ),
    topActions: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          observation: z.string().min(1),
          timeline: z.string().min(1),
        })
        .strict()
    ),
    tiers: z.record(
      z.enum(TIER_NAMES),
      z
        .object({
          description: z.string().min(1),
          features: z.array(z.string().min(1)),
          deliveryTime: z.string().min(1),
          price: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();

const PersistedClaimSchema = z.custom<ValidatedCustomerClaim>(
  (value) =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).claimId === 'string' &&
    typeof (value as Record<string, unknown>).auditId === 'string' &&
    typeof (value as Record<string, unknown>).tenantId === 'string',
  'invalid persisted customer claim'
);

export const ProposalGroundingSchema = z
  .object({
    version: z.literal(1),
    auditId: z.string().min(1),
    tenantId: z.string().min(1),
    claims: z.array(PersistedClaimSchema),
    bindings: ClaimBindingSchema,
    commercial: z
      .object({
        pricingRuleId: z.literal(COMMERCIAL_RULES.pricing),
        tierRuleId: z.literal(COMMERCIAL_RULES.tiers),
        timelineRuleId: z.literal(COMMERCIAL_RULES.timeline),
        currency: z.string().min(1),
        prices: z
          .object({
            essentials: z.number().finite().nonnegative(),
            growth: z.number().finite().nonnegative(),
            premium: z.number().finite().nonnegative(),
          })
          .strict(),
        roiStatus: z.enum(['unavailable', 'calculated']),
      })
      .strict(),
  })
  .strict();

export type ProposalGrounding = z.infer<typeof ProposalGroundingSchema>;

export interface ProposalGroundingContext {
  auditId: string;
  tenantId: string;
  findings: Finding[];
}

export interface GroundingValidation {
  valid: boolean;
  errors: string[];
  grounding?: ProposalGrounding;
}

function claimInput(claim: ValidatedCustomerClaim) {
  const { auditId: _auditId, tenantId: _tenantId, ...input } = claim;
  return input;
}

function makeClaim(
  candidate: Parameters<typeof validateCustomerClaim>[0],
  context: ProposalGroundingContext
): ValidatedCustomerClaim {
  const result = validateCustomerClaim(candidate, context);
  if (!result.success) throw new Error(result.issues.join('; '));
  return result.data;
}

function recommendationClaim(
  claimId: string,
  text: string,
  findingIds: string[],
  context: ProposalGroundingContext
) {
  return makeClaim(
    {
      claimId,
      text,
      claimType: findingIds.length > 0 ? 'RECOMMENDATION' : 'COMMERCIAL_CONFIGURATION',
      sourceFindingIds: findingIds,
      configurationRefs: findingIds.length > 0 ? [] : [COMMERCIAL_RULES.tiers],
      classification: 'derived',
      confidence: 1,
      assumptions: [],
      metricInputs: [],
      estimate: false,
      recommendation: true,
      provenance: { producer: 'proposal.deterministic-package' },
    },
    context
  );
}

function commercialClaim(
  claimId: string,
  text: string,
  ruleId: string,
  context: ProposalGroundingContext
) {
  return makeClaim(
    {
      claimId,
      text,
      claimType: 'COMMERCIAL_CONFIGURATION',
      sourceFindingIds: [],
      configurationRefs: [ruleId],
      classification: 'deterministic',
      confidence: 1,
      assumptions: [],
      metricInputs: [],
      estimate: false,
      recommendation: false,
      provenance: { producer: 'proposal.commercial-rules' },
    },
    context
  );
}

export function buildProposalGrounding(
  proposal: ProposalResult,
  context: ProposalGroundingContext,
  executiveSummaryFindingIds: string[]
): ProposalGrounding {
  const claims: ValidatedCustomerClaim[] = [];
  const summaryClaim = makeClaim(
    {
      claimId: 'proposal-executive-summary',
      text: proposal.executiveSummary,
      claimType: 'LLM_SYNTHESIS_WITH_CITATIONS',
      sourceFindingIds: executiveSummaryFindingIds,
      configurationRefs: [],
      classification: 'llm',
      confidence: 0.7,
      assumptions: [],
      metricInputs: [],
      estimate: false,
      recommendation: false,
      provenance: { producer: 'proposal.executive-summary' },
    },
    context
  );
  claims.push(summaryClaim);

  const painClusters = proposal.painClusters.map((cluster) => {
    const rootCause =
      cluster.rootCauseClaim ??
      makeClaim(
        {
          claimId: `proposal-cluster-${cluster.id}-root`,
          text: cluster.rootCause,
          claimType: 'DERIVED_FROM_FINDINGS',
          sourceFindingIds: cluster.findingIds,
          configurationRefs: [],
          classification: 'derived',
          confidence: 0.8,
          assumptions: [],
          metricInputs: [],
          estimate: false,
          recommendation: false,
          provenance: { producer: 'proposal.pain-cluster' },
        },
        context
      );
    claims.push(rootCause);

    let narrative: string | undefined;
    if (cluster.narrative) {
      const narrativeClaim =
        cluster.narrativeClaim ??
        makeClaim(
          {
            claimId: `proposal-cluster-${cluster.id}-narrative`,
            text: cluster.narrative,
            claimType: 'LLM_SYNTHESIS_WITH_CITATIONS',
            sourceFindingIds: cluster.findingIds,
            configurationRefs: [],
            classification: 'llm',
            confidence: 0.7,
            assumptions: [],
            metricInputs: [],
            estimate: false,
            recommendation: false,
            provenance: { producer: 'proposal.pain-cluster-narrative' },
          },
          context
        );
      claims.push(narrativeClaim);
      narrative = narrativeClaim.claimId;
    }

    return { clusterId: cluster.id, rootCause: rootCause.claimId, narrative };
  });

  const topActions = (proposal.topActions ?? []).map((action, index) => {
    const text = `${action.title}; impact ${action.impact}; effort ${action.effort}`;
    const observation = makeClaim(
      {
        claimId: `proposal-top-action-${index + 1}`,
        text,
        claimType: 'DERIVED_FROM_FINDINGS',
        sourceFindingIds: [action.findingId],
        configurationRefs: [COMMERCIAL_RULES.timeline],
        classification: 'derived',
        confidence: 1,
        assumptions: [],
        metricInputs: [
          {
            name: 'impactScore',
            value: action.impact,
            unit: 'score',
            sourceFindingId: action.findingId,
          },
        ],
        estimate: false,
        recommendation: true,
        provenance: { producer: 'proposal.top-actions' },
      },
      context
    );
    const timeline = commercialClaim(
      `proposal-top-action-${index + 1}-timeline`,
      action.timeline,
      COMMERCIAL_RULES.timeline,
      context
    );
    claims.push(observation, timeline);
    return { index, observation: observation.claimId, timeline: timeline.claimId };
  });

  const tierBindings = {} as ProposalGrounding['bindings']['tiers'];
  for (const tierName of TIER_NAMES) {
    const tier = proposal.tiers[tierName] as TierConfig;
    const description = recommendationClaim(
      `proposal-tier-${tierName}-description`,
      tier.description,
      tier.findingIds,
      context
    );
    claims.push(description);

    const features = (tier.features ?? []).map((feature, index) => {
      const claim = recommendationClaim(
        `proposal-tier-${tierName}-feature-${index + 1}`,
        feature,
        tier.findingIds,
        context
      );
      claims.push(claim);
      return claim.claimId;
    });

    const delivery = commercialClaim(
      `proposal-tier-${tierName}-delivery`,
      tier.deliveryTime,
      COMMERCIAL_RULES.timeline,
      context
    );
    const price = commercialClaim(
      `proposal-tier-${tierName}-price`,
      `${proposal.pricing.currency} ${proposal.pricing[tierName]}`,
      COMMERCIAL_RULES.pricing,
      context
    );
    claims.push(delivery, price);
    tierBindings[tierName] = {
      description: description.claimId,
      features,
      deliveryTime: delivery.claimId,
      price: price.claimId,
    };
  }

  return ProposalGroundingSchema.parse({
    version: 1,
    auditId: context.auditId,
    tenantId: context.tenantId,
    claims,
    bindings: {
      executiveSummary: summaryClaim.claimId,
      painClusters,
      topActions,
      tiers: tierBindings,
    },
    commercial: {
      pricingRuleId: COMMERCIAL_RULES.pricing,
      tierRuleId: COMMERCIAL_RULES.tiers,
      timelineRuleId: COMMERCIAL_RULES.timeline,
      currency: proposal.pricing.currency,
      prices: {
        essentials: proposal.pricing.essentials,
        growth: proposal.pricing.growth,
        premium: proposal.pricing.premium,
      },
      roiStatus: TIER_NAMES.some((name) => proposal.tiers[name].roi) ? 'calculated' : 'unavailable',
    },
  });
}

export function validateProposalGrounding(
  proposal: ProposalResult,
  context: ProposalGroundingContext
): GroundingValidation {
  const parsed = ProposalGroundingSchema.safeParse(proposal.grounding);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (issue) => `grounding.${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }

  const grounding = parsed.data;
  const errors: string[] = [];
  if (grounding.auditId !== context.auditId) errors.push('grounding belongs to another audit');
  if (grounding.tenantId !== context.tenantId) errors.push('grounding belongs to another tenant');

  const claims = new Map(grounding.claims.map((claim) => [claim.claimId, claim]));
  for (const claim of grounding.claims) {
    const validation = validateCustomerClaim(claimInput(claim), context);
    if (!validation.success) {
      errors.push(...validation.issues.map((issue) => `${claim.claimId}: ${issue}`));
    }
  }

  const summaryClaim = claims.get(grounding.bindings.executiveSummary);
  if (!summaryClaim || summaryClaim.text !== proposal.executiveSummary) {
    errors.push('executive summary claim is missing or does not match rendered text');
  }

  for (const binding of grounding.bindings.painClusters) {
    const cluster = proposal.painClusters.find((item) => item.id === binding.clusterId);
    if (!cluster) {
      errors.push(`unknown pain cluster binding '${binding.clusterId}'`);
      continue;
    }
    if (claims.get(binding.rootCause)?.text !== cluster.rootCause) {
      errors.push(`pain cluster '${binding.clusterId}' root-cause claim does not match`);
    }
    if (cluster.narrative && claims.get(binding.narrative || '')?.text !== cluster.narrative) {
      errors.push(`pain cluster '${binding.clusterId}' narrative claim does not match`);
    }
  }

  grounding.bindings.topActions.forEach((binding) => {
    const action = proposal.topActions?.[binding.index];
    const text = action ? `${action.title}; impact ${action.impact}; effort ${action.effort}` : '';
    if (
      !action ||
      claims.get(binding.observation)?.text !== text ||
      claims.get(binding.timeline)?.text !== action.timeline
    ) {
      errors.push(`top action ${binding.index + 1} claim does not match`);
    }
  });

  for (const tierName of TIER_NAMES) {
    const tier = proposal.tiers[tierName];
    const binding = grounding.bindings.tiers[tierName];
    if (!binding) {
      errors.push(`${tierName} grounding binding is missing`);
      continue;
    }
    if (claims.get(binding.description)?.text !== tier.description) {
      errors.push(`${tierName} description claim does not match`);
    }
    (tier.features ?? []).forEach((feature, index) => {
      if (claims.get(binding.features[index] || '')?.text !== feature) {
        errors.push(`${tierName} feature ${index + 1} claim does not match`);
      }
    });
    if (claims.get(binding.deliveryTime)?.text !== tier.deliveryTime) {
      errors.push(`${tierName} delivery-time claim does not match`);
    }
    if (tier.price !== proposal.pricing[tierName]) {
      errors.push(`${tierName} tier price differs from deterministic pricing`);
    }
    if (grounding.commercial.prices[tierName] !== proposal.pricing[tierName]) {
      errors.push(`${tierName} grounding price differs from deterministic pricing`);
    }
    if (tier.roi && grounding.commercial.roiStatus !== 'calculated') {
      errors.push(`${tierName} ROI lacks explicit calculated provenance`);
    }
  }

  return { valid: errors.length === 0, errors, grounding };
}

export function groundingForPersistence(proposal: ProposalResult): ProposalGrounding {
  return ProposalGroundingSchema.parse(proposal.grounding);
}
