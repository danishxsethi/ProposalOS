import { Finding, Proposal } from '@prisma/client';
import { ProposalResult } from '@/lib/proposal';

export interface QAResult {
    category: string;
    check: string;
    passed: boolean;
    details?: string;
}

export interface QAStatus {
    score: number;
    passedChecks: number;
    totalChecks: number;
    results: QAResult[];
    warnings: string[];
    needsReview: boolean;
}

/**
 * Run Automated QA on a generated proposal
 */
export function runAutoQA(
    proposal: ProposalResult,
    findings: Finding[],
    businessName: string,
    city: string | null
): QAStatus {
    const results: QAResult[] = [];

    // --- 1. Finding Quality ---

    // Check evidence pointers
    const findingsWithEvidence = findings.filter(f => {
        const evidence = f.evidence as any[];
        return evidence && evidence.length > 0 && evidence.some((e: any) => e.url || e.source || e.raw);
    });
    results.push({
        category: 'Finding Quality',
        check: 'Evidence Check',
        passed: findingsWithEvidence.length === findings.length,
        details: `${findingsWithEvidence.length}/${findings.length} findings have valid evidence`
    });

    // Check impact scores (Basic range check)
    const validImpact = findings.every(f => f.impactScore >= 1 && f.impactScore <= 10);
    results.push({
        category: 'Finding Quality',
        check: 'Impact Score Range',
        passed: validImpact,
        details: validImpact ? 'All scores valid' : 'Some scores out of range'
    });

    // Check duplicates (Title + Module)
    const uniqueKeys = new Set(findings.map(f => `${f.module}:${f.title}`));
    results.push({
        category: 'Finding Quality',
        check: 'No Duplicates',
        passed: uniqueKeys.size === findings.length,
        details: uniqueKeys.size === findings.length ? 'No duplicates found' : `Found ${findings.length - uniqueKeys.size} duplicates`
    });

    // Minimum counts
    results.push({
        category: 'Finding Quality',
        check: 'Min 3 Findings',
        passed: findings.length >= 3,
        details: `Found ${findings.length} findings`
    });

    const painkillers = findings.filter(f => f.type === 'PAINKILLER');
    results.push({
        category: 'Finding Quality',
        check: 'At least 1 Painkiller',
        passed: painkillers.length >= 1,
        details: `Found ${painkillers.length} painkillers`
    });

    // --- 2. Proposal Quality ---

    // Executive Summary
    const summary = proposal.executiveSummary || '';
    results.push({
        category: 'Proposal Quality',
        check: 'Summary Mentions Business',
        passed: summary.toLowerCase().includes(businessName.toLowerCase()),
        details: 'Checked case-insensitive match'
    });

    if (city) {
        results.push({
            category: 'Proposal Quality',
            check: 'Summary Mentions City',
            passed: summary.toLowerCase().includes(city.toLowerCase()),
            details: 'Checked case-insensitive match'
        });
    }

    // Length check (approximate sentence count by periods)
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    results.push({
        category: 'Proposal Quality',
        check: 'Summary Length (2-6 sentences)',
        passed: sentences >= 2 && sentences <= 6,
        details: `Found ${sentences} sentences`
    });

    // Tier Counts
    const tierCounts = [
        proposal.tiers.essentials.findingIds.length,
        proposal.tiers.growth.findingIds.length,
        proposal.tiers.premium.findingIds.length
    ];
    results.push({
        category: 'Proposal Quality',
        check: 'Tiers have 2+ items',
        passed: tierCounts.every(c => c >= 2),
        details: `Counts: ${tierCounts.join(', ')}`
    });

    // Valid Finding IDs in Tiers
    const allFindingIds = new Set(findings.map(f => f.id));
    const allTierIds = [
        ...proposal.tiers.essentials.findingIds,
        ...proposal.tiers.growth.findingIds,
        ...proposal.tiers.premium.findingIds
    ];
    const invalidIds = allTierIds.filter(id => !allFindingIds.has(id));
    results.push({
        category: 'Proposal Quality',
        check: 'Valid Finding IDs in Tiers',
        passed: invalidIds.length === 0,
        details: invalidIds.length === 0 ? 'All IDs valid' : `Found ${invalidIds.length} invalid IDs`
    });

    // Pricing Sanity Check (Simple heuristic based on existing logic)
    // Essentials < Growth < Premium
    const { essentials, growth, premium } = proposal.pricing;
    results.push({
        category: 'Proposal Quality',
        check: 'Pricing Logic (E < G < P)',
        passed: essentials < growth && growth < premium,
        details: `${essentials} < ${growth} < ${premium}`
    });

    // --- 3. Anti-Hallucination ---

    // Business Name Match (Redundant with Summary check but explicitly for hallucination category)
    results.push({
        category: 'Anti-Hallucination',
        check: 'No Wrong Business Name',
        passed: summary.toLowerCase().includes(businessName.toLowerCase()),
        details: 'Ensures summary is about this business'
    });

    // --- Scoring ---

    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const score = Math.round((passed / total) * 100);

    const warnings: string[] = [];
    if (score < 80) warnings.push('QA Score below 80%');

    // Critical failure conditions
    const needsReview = score < 60;

    return {
        score,
        passedChecks: passed,
        totalChecks: total,
        results,
        warnings,
        needsReview
    };
}
