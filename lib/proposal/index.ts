import { Finding } from '@prisma/client';
import { PainCluster } from '../diagnosis/types';
import { ProposalResult, TierConfig } from './types';
import { mapToTiers } from './tierMapping';
import { getPricing } from './pricing';
import { generateExecutiveSummary } from './executiveSummary';
import {
    validateCitations,
    generateAssumptions,
    generateDisclaimers,
    generateNextSteps,
} from './validation';

import { CostTracker } from '@/lib/costs/costTracker';

/**
 * Main proposal generation pipeline
 */
export async function runProposalPipeline(
    businessName: string,
    businessIndustry: string | undefined,
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker
): Promise<ProposalResult> {
    console.log(`[ProposalPipeline] Generating proposal for ${businessName}...`);

    // Step 1: Map to tiers
    const tierMapping = mapToTiers(clusters, findings);
    console.log(`[ProposalPipeline] Mapped findings to tiers`);

    // Step 2: Get pricing
    const industryPricing = getPricing(businessIndustry);
    const pricing = {
        ...industryPricing,
        currency: 'USD',
    };
    console.log(`[ProposalPipeline] Pricing: $${pricing.essentials}/$${pricing.growth}/$${pricing.premium}`);

    // Step 3: Create tier configs
    const tiers: {
        essentials: TierConfig;
        growth: TierConfig;
        premium: TierConfig;
    } = {
        essentials: {
            name: 'Essentials',
            description: 'Quick wins. Fix the things actively costing you money.',
            findingIds: tierMapping.essentials,
            deliveryTime: '1-2 weeks',
            price: pricing.essentials,
        },
        growth: {
            name: 'Growth',
            description: 'Essentials + competitive improvements. Close the gap with top competitors.',
            findingIds: tierMapping.growth,
            deliveryTime: '3-4 weeks',
            price: pricing.growth,
        },
        premium: {
            name: 'Premium',
            description: 'Full optimization. Everything in Growth + long-term positioning.',
            findingIds: tierMapping.premium,
            deliveryTime: '6-8 weeks',
            price: pricing.premium,
        },
    };

    // Step 4: Generate executive summary (Gemini Pro)
    const executiveSummary = await generateExecutiveSummary(businessName, clusters, findings, tracker);
    console.log(`[ProposalPipeline] Generated executive summary`);

    // Step 5: Build proposal
    const proposal: ProposalResult = {
        executiveSummary,
        painClusters: clusters,
        tiers,
        pricing,
        assumptions: generateAssumptions(businessName),
        disclaimers: generateDisclaimers(),
        nextSteps: generateNextSteps(),
    };

    // Step 6: Validate citations
    const validation = validateCitations(proposal, findings);
    if (!validation.valid) {
        console.error('[ProposalPipeline] Citation validation failed:', validation.errors);
        throw new Error(`Citation validation failed: ${validation.errors.join(', ')}`);
    }

    console.log(`[ProposalPipeline] Proposal generated successfully`);
    return proposal;
}
