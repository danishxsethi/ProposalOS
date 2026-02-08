import { Finding } from '@prisma/client';
import { PainCluster } from '../diagnosis/types';
export type { ProposalResult, TierConfig } from './types';
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
import { RunTree } from 'langsmith';
import { calculateTierROI } from './roiCalculator';

/**
 * Main proposal generation pipeline
 */
export async function runProposalPipeline(
    businessName: string,
    businessIndustry: string | undefined,
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree
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
            recommended: true,
        },
        premium: {
            name: 'Premium',
            description: 'Full optimization. Everything in Growth + long-term positioning.',
            findingIds: tierMapping.premium,
            deliveryTime: '6-8 weeks',
            price: pricing.premium,
        },
    };

    // Calculate ROI for each tier
    // We need to resolve finding objects for the IDs in each tier
    const findingsMap = new Map(findings.map(f => [f.id, f]));

    // Helper to get findings for a tier
    const getTierFindings = (ids: string[]) => ids.map(id => findingsMap.get(id)).filter((f): f is Finding => !!f);

    const essentialsRoi = calculateTierROI(getTierFindings(tiers.essentials.findingIds), tiers.essentials.price || 0, businessIndustry);
    tiers.essentials.roi = { monthlyValue: essentialsRoi.totalMonthlyValue, ratio: essentialsRoi.ratio };

    const growthRoi = calculateTierROI(getTierFindings(tiers.growth.findingIds), tiers.growth.price || 0, businessIndustry);
    tiers.growth.roi = { monthlyValue: growthRoi.totalMonthlyValue, ratio: growthRoi.ratio };

    const premiumRoi = calculateTierROI(getTierFindings(tiers.premium.findingIds), tiers.premium.price || 0, businessIndustry);
    tiers.premium.roi = { monthlyValue: premiumRoi.totalMonthlyValue, ratio: premiumRoi.ratio };


    // Step 4: Generate executive summary (Gemini Pro)
    const executiveSummary = await generateExecutiveSummary(businessName, clusters, findings, tracker, parentTrace);
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
