import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding } from '@/lib/diagnosis/types';
import { adversarialQAGraph } from '@/lib/graph/adversarial-qa-graph';
import { ProposalResult, TierConfig } from '@/lib/proposal/types';
import { mapToTiers } from '@/lib/proposal/tierMapping';
import { getPricing } from '@/lib/proposal/pricing';
import { generateExecutiveSummary } from '@/lib/proposal/executiveSummary';
import {
    validateCitations,
    generateAssumptions,
    generateDisclaimers,
    generateNextSteps,
} from '@/lib/proposal/validation';
import { calculateTierROI } from '@/lib/proposal/roiCalculator';
import { logQATelemetry, computeHallucinationScore } from '@/lib/qa/telemetry';
import { runPredictiveAgent } from '@/lib/graph/predictive-graph';

export const ProposalState = Annotation.Root({
    businessName: Annotation<string>({ reducer: (x, y) => y }),
    businessIndustry: Annotation<string | undefined>({ reducer: (x, y) => y }),
    clusters: Annotation<any[]>({ reducer: (x, y) => y, default: () => [] }),
    findings: Annotation<Finding[]>({ reducer: (x, y) => y, default: () => [] }),
    tierMapping: Annotation<any>({ reducer: (x, y) => y }),
    pricing: Annotation<any>({ reducer: (x, y) => y }),
    tiers: Annotation<any>({ reducer: (x, y) => y }),
    executiveSummary: Annotation<string>({ reducer: (x, y) => y }),
    proposalDef: Annotation<any>({ reducer: (x, y) => y }),
    validation: Annotation<any>({ reducer: (x, y) => y }),
    tenantId: Annotation<string | undefined>({ reducer: (x, y) => y }),
    auditId: Annotation<string | undefined>({ reducer: (x, y) => y }),
    proposalId: Annotation<string | undefined>({ reducer: (x, y) => y }),
    // QA retry tracking
    qaRetryCount: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
    // Predictive Outlook (optional — populated when auditId is present)
    predictiveOutlookMarkdown: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
});

async function map_to_tiers(state: typeof ProposalState.State) {
    const mapping = mapToTiers(state.clusters, state.findings);
    return { tierMapping: mapping };
}

async function calculate_pricing(state: typeof ProposalState.State) {
    const industryPricing = getPricing(state.businessIndustry);
    return {
        pricing: {
            essentials: industryPricing.essentials,
            growth: industryPricing.growth,
            premium: industryPricing.premium,
            currency: 'USD'
        }
    };
}

async function draft_proposal(state: typeof ProposalState.State) {
    const executiveSummary = await generateExecutiveSummary(
        state.businessName, state.clusters, state.findings, undefined, undefined, undefined, undefined, undefined
    );
    return { executiveSummary };
}

async function generate_roi_model(state: typeof ProposalState.State) {
    const findingsMap = new Map(state.findings.map((f: any) => [f.id, f]));
    const getTierFindings = (ids: string[]) => ids.map(id => findingsMap.get(id)).filter((f): f is Finding => !!f);

    const essentialsRoi = calculateTierROI(getTierFindings(state.tierMapping.essentials), state.pricing.essentials, state.businessIndustry, state.findings);
    const growthRoi = calculateTierROI(getTierFindings(state.tierMapping.growth), state.pricing.growth, state.businessIndustry, state.findings);
    const premiumRoi = calculateTierROI(getTierFindings(state.tierMapping.premium), state.pricing.premium, state.businessIndustry, state.findings);

    const tiers = {
        essentials: { name: 'Starter', price: state.pricing.essentials, roi: { monthlyValue: essentialsRoi.totalMonthlyValue, ratio: essentialsRoi.ratio } },
        growth: { name: 'Growth', price: state.pricing.growth, roi: { monthlyValue: growthRoi.totalMonthlyValue, ratio: growthRoi.ratio } },
        premium: { name: 'Premium', price: state.pricing.premium, roi: { monthlyValue: premiumRoi.totalMonthlyValue, ratio: premiumRoi.ratio } }
    };
    return { tiers };
}

async function validate_claims(state: typeof ProposalState.State) {
    const proposalDummy: any = {
        executiveSummary: state.executiveSummary,
        painClusters: state.clusters,
        tiers: state.tiers,
        pricing: state.pricing
    };
    const validation = validateCitations(proposalDummy, state.findings);
    return { validation };
}

async function apply_tone(state: typeof ProposalState.State) {
    return {};
}

async function adversarial_qa(state: typeof ProposalState.State) {
    // Validate all proposal claims are backed by findings + ROI math is consistent
    const content = [
        state.executiveSummary,
        JSON.stringify(state.tiers),
        JSON.stringify(state.pricing),
    ].join('\n---\n');

    const result = await adversarialQAGraph.invoke({
        content,
        findings: state.findings,
        rawEvidence: [],
        tenantId: state.tenantId || 'unknown',
        auditId: state.auditId || 'unknown',
        proposalId: state.proposalId || 'unknown',
        runType: 'proposal'
    });

    const qaScore = computeHallucinationScore(
        result.hallucinationFlags,
        result.consistencyFlags
    );

    const retryTriggered = qaScore > 0.3 && state.qaRetryCount < 1;

    // Log structured telemetry (fire-and-forget)
    await logQATelemetry({
        graphName: 'proposal',
        content,
        qaResult: result,
        retryTriggered,
        retryCount: state.qaRetryCount,
        tenantId: state.tenantId,
        auditId: state.auditId,
        proposalId: state.proposalId,
    });

    if (retryTriggered) {
        console.warn(`[ProposalGraph] QA hallucination score ${qaScore.toFixed(2)} > 0.3 — triggering QA retry (attempt ${state.qaRetryCount + 1})`);
    } else if (result.hallucinationFlags.length > 0) {
        console.warn(`[ProposalGraph] ${result.hallucinationFlags.length} hallucination flag(s), score ${qaScore.toFixed(2)} — within threshold, proceeding`);
    }

    return {
        executiveSummary: result.hardenedContent || state.executiveSummary,
        qaRetryCount: retryTriggered ? state.qaRetryCount + 1 : state.qaRetryCount,
    };
}

/** Routes after QA: retry proposal generation if score > 0.3 and within retry budget. */
function route_qa(state: typeof ProposalState.State): string {
    // qaRetryCount was incremented inside adversarial_qa when retryTriggered
    if (state.qaRetryCount === 1) {
        return 'draft_proposal'; // Re-generate the proposal section
    }
    return 'format_output';
}

async function format_output(state: typeof ProposalState.State) {
    const proposalDef = {
        executiveSummary: state.executiveSummary,
        painClusters: state.clusters,
        tiers: state.tiers,
        pricing: state.pricing,
        assumptions: generateAssumptions(state.businessName),
        disclaimers: generateDisclaimers(),
        nextSteps: generateNextSteps([]),
    };
    return { proposalDef };
}

async function visual_annotation(state: typeof ProposalState.State) {
    // Look for vision module evidence within findings to extract screenshots
    const visualEvidenceList: { screenshotUrl: string; annotationText: string; findingRef: string; severity: number }[] = [];

    for (const finding of state.findings) {
        if (!finding.evidence || !Array.isArray(finding.evidence)) continue;

        for (const ev of finding.evidence as any[]) {
            // Our target is vision module output which commonly embeds URLs
            // Fallback to checking raw contents if explicit type is missing
            const url = ev.url || ev.raw?.url || ev.raw?.screenshotUrl || (ev.type === 'image' ? ev.value : null);
            if (url && typeof url === 'string' && url.startsWith('http')) {
                visualEvidenceList.push({
                    screenshotUrl: url,
                    annotationText: finding.description || `Visual evidence for ${finding.title}`,
                    findingRef: finding.id,
                    severity: finding.impactScore || 5
                });
            }
            // Stop early if we have enough screenshots for this finding
            if (visualEvidenceList.filter(v => v.findingRef === finding.id).length >= 1) break;
        }
    }

    // Sort globally by impact severity (descending)
    visualEvidenceList.sort((a, b) => b.severity - a.severity);

    // Limit to the top 3 overall visual evidence items to avoid cluttering the proposal
    const topVisuals = visualEvidenceList.slice(0, 3);

    // Inject the visual evidence into the tiers object directly as it is mapped
    const updatedTiers = { ...state.tiers };

    if (topVisuals.length > 0) {
        // Embed the same visuals into each tier for consistency, or map them if findingIds match
        const embedIntoTier = (tierName: 'essentials' | 'growth' | 'premium') => {
            if (updatedTiers[tierName]) {
                const tier = updatedTiers[tierName];
                tier.visualEvidence = topVisuals.filter(v =>
                    tier.findingIds?.includes(v.findingRef) || tier.findings?.includes(v.findingRef)
                );
                // If filtering by mapped findingIds returns empty but we have visuals, fallback to globally showing top ones
                if (tier.visualEvidence.length === 0) {
                    tier.visualEvidence = topVisuals;
                }
            }
        };

        embedIntoTier('essentials');
        embedIntoTier('growth');
        embedIntoTier('premium');
    }

    return { tiers: updatedTiers };
}

/**
 * Optional node: runs the Predictive Intelligence graph (Pipeline 12) to generate
 * a "Predictive Outlook" markdown section to include in the proposal.
 * Skipped gracefully if no auditId is available.
 */
async function predict_outlook(state: typeof ProposalState.State) {
    if (!state.auditId) {
        return { predictiveOutlookMarkdown: '' };
    }
    try {
        const outlook = await runPredictiveAgent({
            auditId: state.auditId,
            tenantId: state.tenantId || 'unknown',
            businessName: state.businessName,
            businessUrl: (state as any).businessUrl || '',
            businessIndustry: state.businessIndustry,
        });
        return { predictiveOutlookMarkdown: outlook };
    } catch (error) {
        console.error('[ProposalGraph] predict_outlook failed (non-blocking):', error);
        return { predictiveOutlookMarkdown: '' };
    }
}

export const proposalGraph = new StateGraph(ProposalState)
    .addNode("map_to_tiers", map_to_tiers)
    .addNode("calculate_pricing", calculate_pricing)
    .addNode("visual_annotation", visual_annotation)
    .addNode("draft_proposal", draft_proposal)
    .addNode("generate_roi_model", generate_roi_model)
    .addNode("validate_claims", validate_claims)
    .addNode("apply_tone", apply_tone)
    .addNode("adversarial_qa", adversarial_qa)
    .addNode("format_output", format_output)
    .addNode("predict_outlook", predict_outlook)
    .addEdge("__start__", "map_to_tiers")
    .addEdge("map_to_tiers", "calculate_pricing")
    .addEdge("calculate_pricing", "draft_proposal")
    .addEdge("draft_proposal", "generate_roi_model")
    .addEdge("generate_roi_model", "visual_annotation")
    .addEdge("visual_annotation", "validate_claims")
    .addEdge("validate_claims", "apply_tone")
    .addEdge("apply_tone", "adversarial_qa")
    .addConditionalEdges("adversarial_qa", route_qa, {
        draft_proposal: "draft_proposal",
        format_output: "format_output"
    })
    .addEdge("format_output", "predict_outlook")
    .addEdge("predict_outlook", "__end__")
    .compile();
