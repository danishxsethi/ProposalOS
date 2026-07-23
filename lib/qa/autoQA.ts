import { Finding } from '@prisma/client';
import { ProposalResult } from '@/lib/proposal';
import { ComparisonReport } from '@/lib/proposal/types';

export interface QAResult {
    category: string;
    check: string;
    passed: boolean;
    details?: string;
}

export interface HumanCloseabilityInput {
    tone: number; // 1-10
    trust: number; // 1-10
    buyability: number; // 1-10
    notes?: string;
}

export interface ClientPerfectGate {
    weight: number;
    score: number;
    passedChecks: number;
    totalChecks: number;
    checks: QAResult[];
}

export interface ClientPerfectStatus {
    score: number;
    hardFails: Array<{
        code:
            | 'WRONG_BUSINESS_OR_CITY'
            | 'UNCITED_CRITICAL_CLAIMS'
            | 'GENERIC_SUMMARY_NO_IMPACT'
            | 'TIER_MAPPING_INVALID';
        details: string;
    }>;
    gates: {
        truth: ClientPerfectGate;
        fit: ClientPerfectGate;
        decision: ClientPerfectGate;
    };
    requiresHumanReview: boolean;
    humanCloseability: {
        provided: boolean;
        score: number | null; // 1-10
        passed: boolean | null;
        notes?: string;
    };
}

export interface QAStatus {
    score: number; // kept for backward compatibility, now mirrors clientPerfect.score
    passedChecks: number;
    totalChecks: number;
    results: QAResult[];
    warnings: string[];
    needsReview: boolean;
    clientPerfect: ClientPerfectStatus;
}

export interface QAContext {
    industry?: string | null;
    comparisonReport?: ComparisonReport | null;
    humanCloseability?: HumanCloseabilityInput | null;
}

const METRIC_PATTERN = /\d+(\.\d+)?(%|\/100|\s*(?:seconds?|ms|scores?|rating|reviews?|\$|points?|findings?|issues?|critical|painkillers?|load|speed|LCP|FCP|CLS|index|MB|kb|stars?|hours?|days?|minutes?|of|out\s+of|visitors?|customers?|bounce|traffic|conversion|percent|percentage))/gi;
const IMPACT_LANGUAGE_PATTERN = /(revenue|conversion|lead|booking|pipeline|deal|loss|increase|decrease|roi|close rate|reply rate|meeting)/i;
const CTA_PATTERN = /(reply|schedule|book|call|start|get started|send it|approve|accept)/i;

/** Evidence has valid identifying data. Accepts formats our modules actually produce. */
function hasValidEvidence(e: unknown): boolean {
    if (!e) return false;
    if (typeof e === 'string') return e.trim().length > 0;
    if (typeof e !== 'object') return false;
    const obj = e as Record<string, unknown>;
    if (typeof obj.pointer === 'string' && obj.pointer.length > 0 && obj.collected_at) return true;
    if (obj.type && (obj.value !== undefined || obj.label)) return true;
    return !!(obj.url || obj.source || obj.raw);
}

function computeGate(weight: number, checks: QAResult[]): ClientPerfectGate {
    const passedChecks = checks.filter((c) => c.passed).length;
    const totalChecks = checks.length || 1;
    const score = Math.round((passedChecks / totalChecks) * 100);
    return { weight, score, passedChecks, totalChecks, checks };
}

function scoreHumanCloseability(input?: HumanCloseabilityInput | null): {
    provided: boolean;
    score: number | null;
    passed: boolean | null;
    notes?: string;
} {
    if (!input) {
        return { provided: false, score: null, passed: null };
    }
    const tone = Math.max(1, Math.min(10, Number(input.tone) || 0));
    const trust = Math.max(1, Math.min(10, Number(input.trust) || 0));
    const buyability = Math.max(1, Math.min(10, Number(input.buyability) || 0));
    const avg = Number(((tone + trust + buyability) / 3).toFixed(1));
    return {
        provided: true,
        score: avg,
        passed: avg >= 8,
        notes: input.notes,
    };
}

/**
 * Run client-perfect QA on a generated proposal.
 * 3 weighted gates:
 * - Truth (40%): traceability and factual integrity
 * - Fit (35%): business/vertical/competitive specificity
 * - Decision (25%): ROI clarity, actionability, CTA
 */
export function runAutoQA(
    proposal: ProposalResult,
    findings: Finding[],
    businessName: string,
    city: string | null,
    context?: QAContext
): QAStatus {
    const results: QAResult[] = [];
    const summary = proposal.executiveSummary || '';
    const summaryLower = summary.toLowerCase();
    const industry = (context?.industry || '').toLowerCase();

    const allFindingIds = new Set(findings.map((f) => f.id));
    const allTierIds = [
        ...proposal.tiers.essentials.findingIds,
        ...proposal.tiers.growth.findingIds,
        ...proposal.tiers.premium.findingIds,
    ];
    const invalidTierIds = allTierIds.filter((id) => !allFindingIds.has(id));

    const findingsWithEvidence = findings.filter((f) => {
        const evidence = (f.evidence as unknown[]) || [];
        return evidence.some(hasValidEvidence);
    });
    const criticalFindings = findings.filter((f) => f.impactScore >= 8 || f.type === 'PAINKILLER');
    const uncitedCritical = criticalFindings.filter((f) => {
        const evidence = (f.evidence as unknown[]) || [];
        return !evidence.some(hasValidEvidence);
    });

    const metricMatches = summary.match(METRIC_PATTERN) || [];
    const hasQuantifiedImpactLanguage = metricMatches.length >= 3 && IMPACT_LANGUAGE_PATTERN.test(summary);

    const summaryMentionsBusiness = summaryLower.includes(businessName.toLowerCase());
    const summaryMentionsCity = city ? summaryLower.includes(city.toLowerCase()) : true;

    const dedupeKeyCount = new Set(findings.map((f) => `${f.module}:${f.title}`)).size;
    const impactScoreRangeValid = findings.every((f) => f.impactScore >= 1 && f.impactScore <= 10);

    const tierCounts = [
        proposal.tiers.essentials.findingIds.length,
        proposal.tiers.growth.findingIds.length,
        proposal.tiers.premium.findingIds.length,
    ];

    const pricingLogic = proposal.pricing.essentials < proposal.pricing.growth && proposal.pricing.growth < proposal.pricing.premium;

    const competitorNames = (context?.comparisonReport?.competitors || [])
        .map((c) => c.name || '')
        .filter((n) => n.trim().length > 0);
    const mentionsCompetitorByName =
        competitorNames.length > 0 &&
        competitorNames.some((name) => summaryLower.includes(name.toLowerCase()));

    const industryTokens = industry
        .split(/[^a-z0-9]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4);
    const mentionsIndustry = industryTokens.length > 0
        ? industryTokens.some((token) => summaryLower.includes(token))
        : true;

    const topActionRows = (proposal.nextSteps || []).filter((s) =>
        /impact:/i.test(s) && /effort:/i.test(s) && /timeline:/i.test(s)
    );
    const hasTop3ActionPlan = topActionRows.length >= 3;

    const tiersWithRoi = [proposal.tiers.essentials, proposal.tiers.growth, proposal.tiers.premium];
    const hasRoiScenarios = tiersWithRoi.every((tier) => {
        const s = tier.roi?.scenarios;
        return !!(
            s &&
            typeof s.best === 'number' &&
            typeof s.base === 'number' &&
            typeof s.worst === 'number' &&
            s.best >= s.base &&
            s.base >= s.worst &&
            Array.isArray(s.assumptions) &&
            s.assumptions.length >= 2
        );
    });
    const hasRoiAssumptions = (proposal.assumptions || []).length >= 2;
    const clearCta = (proposal.nextSteps || []).some((line) => CTA_PATTERN.test(line));

    // --- Truth Gate (40%) ---
    const truthChecks: QAResult[] = [
        {
            category: 'Truth',
            check: 'Evidence Check',
            passed: findingsWithEvidence.length === findings.length,
            details: `${findingsWithEvidence.length}/${findings.length} findings have valid evidence`,
        },
        {
            category: 'Truth',
            check: 'Critical Findings Cited',
            passed: uncitedCritical.length === 0,
            details:
                uncitedCritical.length === 0
                    ? `All ${criticalFindings.length} critical findings have evidence`
                    : `${uncitedCritical.length}/${criticalFindings.length} critical findings missing evidence`,
        },
        {
            category: 'Truth',
            check: 'Impact Score Range',
            passed: impactScoreRangeValid,
            details: impactScoreRangeValid ? 'All scores valid (1-10)' : 'Some impact scores out of range',
        },
        {
            category: 'Truth',
            check: 'No Duplicates',
            passed: dedupeKeyCount === findings.length,
            details:
                dedupeKeyCount === findings.length
                    ? 'No duplicate findings detected'
                    : `Found ${findings.length - dedupeKeyCount} duplicate findings`,
        },
        {
            category: 'Truth',
            check: 'Tier Mapping Valid',
            passed: invalidTierIds.length === 0,
            details:
                invalidTierIds.length === 0
                    ? 'All tier IDs map to real findings'
                    : `Found ${invalidTierIds.length} tier IDs not present in findings`,
        },
    ];

    // --- Fit Gate (35%) ---
    const fitChecks: QAResult[] = [
        {
            category: 'Fit',
            check: 'Summary Mentions Business',
            passed: summaryMentionsBusiness,
            details: 'Case-insensitive exact business-name check',
        },
        {
            category: 'Fit',
            check: 'Summary Mentions City',
            passed: summaryMentionsCity,
            details: city ? `Expected city mention: ${city}` : 'City not provided; check skipped',
        },
        {
            category: 'Fit',
            check: 'Industry/Vertical Context',
            passed: mentionsIndustry,
            details:
                industryTokens.length > 0
                    ? `Industry tokens checked: ${industryTokens.join(', ')}`
                    : 'Industry not provided; check skipped',
        },
        {
            category: 'Fit',
            check: 'Competitor By Name Comparison',
            passed: mentionsCompetitorByName,
            details:
                competitorNames.length > 0
                    ? `Competitors considered: ${competitorNames.slice(0, 3).join(', ')}`
                    : 'No competitor context provided',
        },
    ];

    // --- Decision Gate (25%) ---
    const decisionChecks: QAResult[] = [
        {
            category: 'Decision',
            check: 'Summary Cites Specific Metrics (≥3)',
            passed: metricMatches.length >= 3,
            details: `Found ${metricMatches.length} quantified metrics`,
        },
        {
            category: 'Decision',
            check: 'Top 3 Actions With Impact/Effort/Timeline',
            passed: hasTop3ActionPlan,
            details: `Found ${topActionRows.length} structured action lines`,
        },
        {
            category: 'Decision',
            check: 'ROI Scenarios (Best/Base/Worst) Per Tier',
            passed: hasRoiScenarios,
            details: hasRoiScenarios ? 'All tiers include valid ROI scenarios' : 'One or more tiers missing ROI scenario block',
        },
        {
            category: 'Decision',
            check: 'ROI Assumptions Present',
            passed: hasRoiAssumptions,
            details: `Proposal has ${(proposal.assumptions || []).length} assumptions`,
        },
        {
            category: 'Decision',
            check: 'Pricing Logic (E < G < P)',
            passed: pricingLogic,
            details: `${proposal.pricing.essentials} < ${proposal.pricing.growth} < ${proposal.pricing.premium}`,
        },
        {
            category: 'Decision',
            check: 'Clear CTA / Low-Friction Next Step',
            passed: clearCta,
            details: clearCta ? 'At least one CTA detected in next steps' : 'No clear CTA found in next steps',
        },
    ];

    // Aggregate all checks for legacy compatibility
    results.push(...truthChecks, ...fitChecks, ...decisionChecks);

    // Hard-fail conditions
    const hardFails: ClientPerfectStatus['hardFails'] = [];
    if (!summaryMentionsBusiness || !summaryMentionsCity) {
        hardFails.push({
            code: 'WRONG_BUSINESS_OR_CITY',
            details: `Business mention: ${summaryMentionsBusiness}, city mention: ${summaryMentionsCity}`,
        });
    }
    if (uncitedCritical.length > 0) {
        hardFails.push({
            code: 'UNCITED_CRITICAL_CLAIMS',
            details: `${uncitedCritical.length} critical findings have no valid evidence`,
        });
    }
    if (!hasQuantifiedImpactLanguage) {
        hardFails.push({
            code: 'GENERIC_SUMMARY_NO_IMPACT',
            details: `Requires >=3 metrics plus impact language. Metrics found: ${metricMatches.length}`,
        });
    }
    if (invalidTierIds.length > 0 || tierCounts.some((c) => c < 2)) {
        hardFails.push({
            code: 'TIER_MAPPING_INVALID',
            details: `Invalid IDs: ${invalidTierIds.length}, tier counts: ${tierCounts.join(', ')}`,
        });
    }

    const truth = computeGate(0.4, truthChecks);
    const fit = computeGate(0.35, fitChecks);
    const decision = computeGate(0.25, decisionChecks);

    let weightedScore = Math.round(
        truth.score * truth.weight + fit.score * fit.weight + decision.score * decision.weight
    );

    const humanCloseability = scoreHumanCloseability(context?.humanCloseability);
    const isTopProposal = weightedScore >= 90;
    const requiresHumanReview = isTopProposal && !humanCloseability.provided;

    if (humanCloseability.provided && humanCloseability.score != null) {
        // Blend in 15% reviewer signal once provided (2-minute pass for tone/trust/buyability).
        weightedScore = Math.round(weightedScore * 0.85 + humanCloseability.score * 10 * 0.15);
    }

    if (hardFails.length > 0) {
        weightedScore = 0;
    }

    const warnings: string[] = [];
    if (hardFails.length > 0) warnings.push('Hard-fail triggered: client score forced to 0');
    if (requiresHumanReview) warnings.push('Top proposal requires 2-minute human closeability review');
    if (weightedScore < 90) warnings.push('Client-perfect score below 90');
    if (!mentionsCompetitorByName) warnings.push('Missing competitor-by-name comparison in summary');

    const passedChecks = results.filter((r) => r.passed).length;
    const totalChecks = results.length;
    const needsReview = hardFails.length > 0 || weightedScore < 60;

    return {
        score: weightedScore,
        passedChecks,
        totalChecks,
        results,
        warnings,
        needsReview,
        clientPerfect: {
            score: weightedScore,
            hardFails,
            gates: { truth, fit, decision },
            requiresHumanReview,
            humanCloseability,
        },
    };
}
