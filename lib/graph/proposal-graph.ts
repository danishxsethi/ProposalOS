import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding } from '@/lib/diagnosis/types';
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

export const proposalGraph = new StateGraph(ProposalState)
    .addNode("map_to_tiers", map_to_tiers)
    .addNode("calculate_pricing", calculate_pricing)
    .addNode("draft_proposal", draft_proposal)
    .addNode("generate_roi_model", generate_roi_model)
    .addNode("validate_claims", validate_claims)
    .addNode("apply_tone", apply_tone)
    .addNode("format_output", format_output)
    .addEdge("__start__", "map_to_tiers")
    .addEdge("map_to_tiers", "calculate_pricing")
    .addEdge("calculate_pricing", "draft_proposal")
    .addEdge("draft_proposal", "generate_roi_model")
    .addEdge("generate_roi_model", "validate_claims")
    .addEdge("validate_claims", "apply_tone")
    .addEdge("apply_tone", "format_output")
    .addEdge("format_output", "__end__")
    .compile();
