/**
 * Thinking Budgets Configuration
 * 
 * Maps LangGraph node identifiers to their allowed reasoning token limits for Gemini 3.1 Pro.
 * 0 indicates reasoning is disabled.
 */

export const THINKING_BUDGETS: Record<string, number> = {
    // Diagnosis Graph Nodes
    parse_findings: 0, // Structured extraction
    cluster_root_causes: 4096, // Needs causal reasoning
    rank_by_impact: 2048, // Comparative judgment
    classify_painkillers: 0, // Classification only
    classify_vitamins: 0, // Classification only
    validate_diagnosis: 4096, // Hallucination checking

    // Proposal Graph Nodes
    generate_narrative: 8192, // Persuasive writing needs deep reasoning
    draft_proposal: 8192, // Complex multi-section document
    generate_roi_model: 4096, // Financial reasoning
    validate_claims: 4096, // Fact-checking requires deliberate reasoning
};

/**
 * Returns the thinking budget for a given node. Defaults to 0 if not found.
 */
export function getThinkingBudgetForNode(nodeName: string): number {
    return THINKING_BUDGETS[nodeName] || 0;
}
