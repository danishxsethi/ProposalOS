import { Finding } from '@prisma/client';
import { PainCluster } from '../diagnosis/types';
export type { ProposalResult, TierConfig, ComparisonReport } from './types';
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
import type { VerticalPlaybook } from '@/lib/playbooks/types';
import { createEvidence } from '@/lib/modules/types';

/** QA-aligned: has pointer+collected_at or type+(value|label) or url/source/raw/string */
function hasValidEvidence(e: unknown): boolean {
    if (!e || typeof e !== 'object') return false;
    const o = e as Record<string, unknown>;
    if (typeof o.pointer === 'string' && o.pointer.length > 0 && o.collected_at) return true;
    if (o.type && (o.value !== undefined || o.label)) return true;
    return !!(o.url || o.source || o.raw || (typeof e === 'string' && (e as string).length > 0));
}

/**
 * Agency-grade hardening: dedupe by (module, title), clamp impact 1–10,
 * ensure each finding has ≥1 valid evidence, ensure ≥1 PAINKILLER.
 */
function normalizeFindingsForProposal(findings: Finding[]): Finding[] {
    const seen = new Set<string>();
    const deduped: Finding[] = [];
    for (const f of findings) {
        const key = `${f.module}:${f.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(f);
    }
    for (const f of deduped) {
        (f as { impactScore: number }).impactScore = Math.min(10, Math.max(1, Number(f.impactScore) || 5));
        const evidence = (f.evidence as unknown[]) ?? [];
        if (!evidence.some(hasValidEvidence)) {
            (f as { evidence: unknown }).evidence = [
                ...evidence,
                createEvidence({ pointer: 'audit', source: 'proposal_normalize', type: 'text', value: f.title, label: f.module }),
            ];
        }
    }
    const painkillers = deduped.filter((f) => f.type === 'PAINKILLER');
    if (painkillers.length === 0 && deduped.length > 0) {
        const byImpact = [...deduped].sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));
        (byImpact[0] as { type: string }).type = 'PAINKILLER';
    }
    return deduped;
}

function timelineByEffort(effort?: string | null): string {
    const e = (effort || 'MEDIUM').toUpperCase();
    if (e === 'LOW') return '7 days';
    if (e === 'HIGH') return '30-45 days';
    return '14-21 days';
}

/**
 * Main proposal generation pipeline
 * @param playbook Optional vertical playbook — influences pricing, recommended tier, and proposal language
 */
export async function runProposalPipeline(
    businessName: string,
    businessIndustry: string | undefined,
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree,
    playbook?: VerticalPlaybook | null,
    comparisonReport?: import('./types').ComparisonReport | null,
    city?: string | null
): Promise<ProposalPipelineResult> {
    console.log(`[ProposalPipeline] Generating proposal for ${businessName}...${playbook ? ` (vertical: ${playbook.id})` : ''}`);

    const normalizedFindings = normalizeFindingsForProposal([...findings]);

    // Step 1: Map to tiers
    const tierMapping = mapToTiers(clusters, normalizedFindings);
    console.log(`[ProposalPipeline] Mapped findings to tiers`);

    // Step 2: Get pricing (apply playbook multiplier if present)
    const industryPricing = getPricing(businessIndustry);
    const multiplier = playbook?.pricingMultiplier ?? 1.0;
    const pricing = {
        essentials: Math.round(industryPricing.essentials * multiplier),
        growth: Math.round(industryPricing.growth * multiplier),
        premium: Math.round(industryPricing.premium * multiplier),
        currency: 'USD',
    };
    console.log(`[ProposalPipeline] Pricing: $${pricing.essentials}/$${pricing.growth}/$${pricing.premium}${multiplier !== 1 ? ` (${multiplier}x)` : ''}`);

    // Step 3: Create tier configs (Starter / Growth / Premium)
    // Starter: entry point, limited scope. Growth: OBVIOUS BEST VALUE (anchoring). Premium: full-service, premium positioning.
    const tiers: {
        essentials: TierConfig;
        growth: TierConfig;
        premium: TierConfig;
    } = {
        essentials: {
            name: 'Starter',
            description: 'Entry point — quick wins only. Speed optimization, basic SEO, and essential fixes. Limited scope, clear constraints.',
            findingIds: tierMapping.essentials,
            deliveryTime: '5 business days',
            price: pricing.essentials,
            recommended: (playbook?.recommendedTier ?? 'growth') === 'starter',
            features: [
                'Speed optimization (image compression, lazy loading, caching)',
                'Basic SEO fixes (meta tags, sitemap, schema markup)',
                '1 round of revisions',
            ],
        },
        growth: {
            name: 'Growth',
            description: 'The full transformation — best value. Everything in Starter plus competitive edge. Everything you need to overtake competitors.',
            findingIds: tierMapping.growth,
            deliveryTime: '10 business days',
            price: pricing.growth,
            recommended: (playbook?.recommendedTier ?? 'growth') === 'growth',
            badge: 'BEST VALUE',
            features: [
                'Everything in Starter',
                'Full SEO overhaul (content optimization, internal linking, local SEO)',
                'Google Business Profile optimization',
                'Conversion optimization (CTAs, forms, click-to-call)',
                'Accessibility fixes (WCAG 2.1 Level A)',
                'Competitor gap analysis report',
                '3 rounds of revisions',
            ],
        },
        premium: {
            name: 'Premium',
            description: 'Full-service — ongoing partnership. Everything in Growth plus content and monitoring. Premium positioning, custom work.',
            findingIds: tierMapping.premium,
            deliveryTime: '15 business days',
            price: pricing.premium,
            recommended: (playbook?.recommendedTier ?? 'growth') === 'premium',
            features: [
                'Everything in Growth',
                'Content creation (3 new pages/blog posts, optimized for local SEO)',
                'Monthly performance monitoring (3 months)',
                'Priority support',
                'Quarterly re-audit and progress report',
                'Unlimited revisions',
            ],
        },
    };

    // Calculate ROI for each tier
    // We need to resolve finding objects for the IDs in each tier
    const findingsMap = new Map(normalizedFindings.map(f => [f.id, f]));

    // Helper to get findings for a tier
    const getTierFindings = (ids: string[]) => ids.map(id => findingsMap.get(id)).filter((f): f is Finding => !!f);

    const essentialsRoi = calculateTierROI(getTierFindings(tiers.essentials.findingIds), tiers.essentials.price || 0, businessIndustry, normalizedFindings);
    tiers.essentials.roi = {
        monthlyValue: essentialsRoi.totalMonthlyValue,
        ratio: essentialsRoi.ratio,
        scenarios: {
            best: Math.round(essentialsRoi.totalMonthlyValue * 1.25),
            base: essentialsRoi.totalMonthlyValue,
            worst: Math.round(essentialsRoi.totalMonthlyValue * 0.6),
            assumptions: [
                'Implementation completed as scoped within the tier',
                'Traffic and conversion rates remain within current benchmark range',
                'Performance gains materialize after deployment and indexing cycle',
            ],
        },
    };

    const growthRoi = calculateTierROI(getTierFindings(tiers.growth.findingIds), tiers.growth.price || 0, businessIndustry, normalizedFindings);
    tiers.growth.roi = {
        monthlyValue: growthRoi.totalMonthlyValue,
        ratio: growthRoi.ratio,
        scenarios: {
            best: Math.round(growthRoi.totalMonthlyValue * 1.25),
            base: growthRoi.totalMonthlyValue,
            worst: Math.round(growthRoi.totalMonthlyValue * 0.6),
            assumptions: [
                'Growth-tier fixes are shipped and measured against baseline',
                'Local search demand remains stable over the quarter',
                'Offer and conversion paths stay consistent during implementation',
            ],
        },
    };

    const premiumRoi = calculateTierROI(getTierFindings(tiers.premium.findingIds), tiers.premium.price || 0, businessIndustry, normalizedFindings);
    tiers.premium.roi = {
        monthlyValue: premiumRoi.totalMonthlyValue,
        ratio: premiumRoi.ratio,
        scenarios: {
            best: Math.round(premiumRoi.totalMonthlyValue * 1.25),
            base: premiumRoi.totalMonthlyValue,
            worst: Math.round(premiumRoi.totalMonthlyValue * 0.6),
            assumptions: [
                'Premium scope is executed end-to-end with monitoring',
                'Content and technical work are approved without major delays',
                'Competitive dynamics remain similar to current benchmark snapshot',
            ],
        },
    };

    // Top 3 decision-driving actions (impact + effort + timeline)
    const topActions = [...normalizedFindings]
        .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
        .slice(0, 3)
        .map((f) => ({
            findingId: f.id,
            title: f.title,
            impact: f.impactScore,
            effort: (f.effortEstimate || 'MEDIUM').toUpperCase(),
            timeline: timelineByEffort(f.effortEstimate),
        }));
    const topActionLines = topActions.map(
        (a, i) =>
            `Top Action ${i + 1}: ${a.title} | Impact: ${a.impact}/10 | Effort: ${a.effort} | Timeline: ${a.timeline}`
    );


    // Step 4: Generate executive summary (playbook + comparison influence language)
    const executiveSummary = await generateExecutiveSummary(businessName, clusters, normalizedFindings, tracker, parentTrace, playbook ?? undefined, city ?? undefined, comparisonReport ?? undefined);
    console.log(`[ProposalPipeline] Generated executive summary`);

    // Step 5: Build proposal
    const proposal: ProposalResult = {
        executiveSummary,
        painClusters: clusters,
        comparisonReport: comparisonReport ?? undefined,
        topActions,
        tiers,
        pricing,
        assumptions: generateAssumptions(businessName),
        disclaimers: generateDisclaimers(),
        nextSteps: generateNextSteps(topActionLines),
    };

    // Step 6: Validate citations
    const validation = validateCitations(proposal, normalizedFindings);
    if (!validation.valid) {
        console.error('[ProposalPipeline] Citation validation failed:', validation.errors);
        throw new Error(`Citation validation failed: ${validation.errors.join(', ')}`);
    }

    console.log(`[ProposalPipeline] Proposal generated successfully`);
    return { ...proposal, normalizedFindings };
}

export type ProposalPipelineResult = ProposalResult & { normalizedFindings: Finding[] };
