import { ProposalResult } from './types';
import { Finding } from '@prisma/client';

/**
 * Validate that all claims in the proposal are backed by evidence
 */
export function validateCitations(
    proposal: ProposalResult,
    findings: Finding[]
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const findingIds = new Set(findings.map((f) => f.id));

    // Check essentials tier
    for (const id of proposal.tiers.essentials.findingIds) {
        if (!findingIds.has(id)) {
            errors.push(`Essentials tier references non-existent finding: ${id}`);
        }
    }

    // Check growth tier
    for (const id of proposal.tiers.growth.findingIds) {
        if (!findingIds.has(id)) {
            errors.push(`Growth tier references non-existent finding: ${id}`);
        }
    }

    // Check premium tier
    for (const id of proposal.tiers.premium.findingIds) {
        if (!findingIds.has(id)) {
            errors.push(`Premium tier references non-existent finding: ${id}`);
        }
    }

    // Check pain clusters
    for (const cluster of proposal.painClusters) {
        for (const id of cluster.findingIds) {
            if (!findingIds.has(id)) {
                errors.push(`Cluster "${cluster.rootCause}" references non-existent finding: ${id}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Generate standard assumptions
 */
export function generateAssumptions(businessName: string): string[] {
    return [
        `${businessName} will provide necessary access to accounts (Google Business Profile, website analytics)`,
        'Implementation timeline assumes standard business hours and reasonable response times',
        'Pricing is based on the scope outlined in each tier; additional work may incur extra fees',
        'Monthly reporting and ongoing support not included (available as add-on)',
    ];
}

/**
 * Generate standard disclaimers
 */
export function generateDisclaimers(): string[] {
    return [
        'Audit data collected on the date of analysis; some metrics may change over time',
        'Competitor data is based on publicly available information',
        'Results may vary based on industry, location, and market conditions',
        'SEO and ranking improvements can take 3-6 months to materialize',
    ];
}

/**
 * Generate next steps
 */
export function generateNextSteps(topActionLines: string[] = []): string[] {
    const base = [
        'Review this proposal and select your preferred tier',
        'Reply to this email or schedule a 15-minute call to discuss',
        'We\'ll send a simple contract and invoice',
        'Kickoff call within 3 business days of signing',
    ];
    return topActionLines.length > 0 ? [...topActionLines, ...base] : base;
}
