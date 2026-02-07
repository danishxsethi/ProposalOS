export interface ModuleResult {
    status: 'success' | 'failed';
    data?: any;
    error?: string;
    costCents?: number; // Cost in cents
}

export function calculateTotalCost(results: {
    website?: ModuleResult;
    gbp?: ModuleResult;
    competitor?: ModuleResult;
    diagnosis?: { costCents: number };
    proposal?: { costCents: number };
}): number {
    let total = 0;

    if (results.website?.costCents) total += results.website.costCents;
    if (results.gbp?.costCents) total += results.gbp.costCents;
    if (results.competitor?.costCents) total += results.competitor.costCents;
    if (results.diagnosis?.costCents) total += results.diagnosis.costCents;
    if (results.proposal?.costCents) total += results.proposal.costCents;

    return total;
}
