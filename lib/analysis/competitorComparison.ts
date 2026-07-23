/**
 * Competitor Comparison — generates ComparisonReport from prospect + competitor data.
 */

export interface BusinessScores {
    name: string;
    performanceScore?: number;
    seoScore?: number;
    accessibilityScore?: number;
    mobileScore?: number;
    loadTimeSeconds?: number;
    rating?: number;
    reviewCount?: number;
    website?: string;
}

export interface ComparisonTableRow {
    metric: string;
    prospectValue: string | number;
    prospectStatus: 'win' | 'lose' | 'tie';
    competitorValues: Array<{ name: string; value: string | number; status: 'win' | 'lose' | 'tie' }>;
}

export interface ComparisonReport {
    prospect: BusinessScores;
    competitors: BusinessScores[];
    prospectRank: number;
    winningCategories: string[];
    losingCategories: string[];
    biggestGap: {
        category: string;
        prospectScore: number;
        bestCompetitorScore: number;
        competitorName: string;
        gap: number;
    } | null;
    summaryStatement: string;
    positiveStatement: string;
    urgencyStatement: string;
    /** Top 3 actions to overtake at least one competitor */
    quickWins: Array<{
        action: string;
        effortEstimate: string;
        expectedImpact: string;
    }>;
    /** Table rows for comparison table (Metric | You | Comp1 | Comp2) */
    comparisonTableRows: ComparisonTableRow[];
    /** "You're winning on X/Y metrics" or "Your competitors lead on X/Y metrics" */
    summaryRow: string;
    /** 2-3 bullet points where prospect beats competitors (with specific numbers) */
    whereAhead: string[];
    /** 2-3 bullet points where competitors beat prospect (with specific numbers) */
    whereBehind: string[];
}

const METRIC_LABELS: Record<string, string> = {
    performanceScore: 'PageSpeed',
    mobileScore: 'Mobile Score',
    loadTimeSeconds: 'Load Time',
    rating: 'Google Rating',
    reviewCount: 'Reviews',
    seoScore: 'SEO Score',
    accessibilityScore: 'Accessibility',
};

/** Lower is better for load time */
const LOWER_IS_BETTER = new Set(['loadTimeSeconds']);

function getMetricValue(b: BusinessScores, key: string): number {
    const v = (b as unknown as Record<string, unknown>)[key];
    return typeof v === 'number' ? v : 0;
}

function rankProspect(prospect: BusinessScores, competitors: BusinessScores[], metricKeys: string[]): number {
    const compositeScore = (b: BusinessScores): number => {
        let score = 0;
        for (const key of metricKeys) {
            const v = getMetricValue(b, key);
            if (v === 0) continue;
            const lowerBetter = LOWER_IS_BETTER.has(key);
            score += lowerBetter ? 100 - Math.min(100, v * 20) : v;
        }
        return score;
    };
    const scores = [prospect, ...competitors].map((b, i) => ({ b, i, score: compositeScore(b) }));
    scores.sort((a, b) => b.score - a.score);
    const prospectIdx = scores.findIndex((s) => s.i === 0);
    return prospectIdx >= 0 ? prospectIdx + 1 : 1;
}

/**
 * Generate comparison report from prospect and competitor data.
 */
export function generateComparison(
    prospect: BusinessScores,
    competitors: BusinessScores[],
    industry: string = 'business'
): ComparisonReport {
    const metricKeys = ['performanceScore', 'mobileScore', 'loadTimeSeconds', 'rating', 'reviewCount', 'seoScore', 'accessibilityScore'];
    const all = [prospect, ...competitors];
    const totalCount = all.length;

    const prospectRank = competitors.length > 0
        ? rankProspect(prospect, competitors, metricKeys)
        : 1;

    const winningCategories: string[] = [];
    const losingCategories: string[] = [];

    for (const key of metricKeys) {
        const pVal = getMetricValue(prospect, key);
        if (pVal === 0) continue;

        const lowerBetter = LOWER_IS_BETTER.has(key);
        const compVals = competitors.map((c) => getMetricValue(c, key)).filter((v) => v > 0);

        if (compVals.length === 0) continue;

        const bestComp = lowerBetter ? Math.min(...compVals) : Math.max(...compVals);
        const prospectWins = lowerBetter ? pVal < bestComp : pVal > bestComp;
        const prospectWorst = lowerBetter
            ? competitors.every((c) => getMetricValue(c, key) <= pVal || getMetricValue(c, key) === 0)
            : competitors.every((c) => getMetricValue(c, key) >= pVal || getMetricValue(c, key) === 0);

        if (prospectWins) winningCategories.push(METRIC_LABELS[key] || key);
        if (prospectWorst && !prospectWins) losingCategories.push(METRIC_LABELS[key] || key);
    }

    let biggestGap: ComparisonReport['biggestGap'] = null;
    let maxGap = 0;

    for (const key of metricKeys) {
        const pVal = getMetricValue(prospect, key);
        if (pVal === 0) continue;

        const lowerBetter = LOWER_IS_BETTER.has(key);
        for (const c of competitors) {
            const cVal = getMetricValue(c, key);
            if (cVal === 0) continue;

            let gap: number;
            if (lowerBetter) {
                gap = pVal - cVal;
            } else {
                gap = cVal - pVal;
            }
            if (gap > maxGap) {
                maxGap = gap;
                biggestGap = {
                    category: METRIC_LABELS[key] || key,
                    prospectScore: pVal,
                    bestCompetitorScore: cVal,
                    competitorName: c.name,
                    gap,
                };
            }
        }
    }

    const industryLabel = industry || 'business';
    const rankText = `You rank #${prospectRank} out of ${totalCount} ${industryLabel}s in your area.`;
    const summaryParts: string[] = [rankText];

    if (losingCategories.length > 0) {
        const worst = losingCategories[0];
        if (worst === 'Load Time' || worst === 'PageSpeed' || worst === 'Mobile Score') {
            summaryParts.push(`Your website is slower than ${competitors.length > 1 ? 'all competitors' : 'your competitor'}.`);
        } else {
            summaryParts.push(`You're behind on ${losingCategories.slice(0, 2).join(' and ')}.`);
        }
    }
    const summaryStatement = summaryParts.join(' ');

    let positiveStatement = '';
    if (winningCategories.length > 0) {
        const top = winningCategories[0];
        const pRating = prospect.rating ?? 0;
        const pReviews = prospect.reviewCount ?? 0;
        if (top === 'Google Rating' && pRating > 0) {
            positiveStatement = `You have the highest Google rating (${pRating}★) — your reputation is strong.`;
        } else if (top === 'Reviews' && pReviews > 0) {
            positiveStatement = `You have the most reviews (${pReviews}) — social proof is on your side.`;
        } else {
            positiveStatement = `You're winning on ${top} — a clear advantage to highlight.`;
        }
    } else {
        positiveStatement = 'There are opportunities to differentiate from competitors.';
    }

    let urgencyStatement = '';
    if (biggestGap && biggestGap.gap > 0) {
        const { competitorName, category, prospectScore, bestCompetitorScore } = biggestGap;
        const metricKey = Object.entries(METRIC_LABELS).find(([, v]) => v === category)?.[0] || '';
        if (LOWER_IS_BETTER.has(metricKey)) {
            urgencyStatement = `${competitorName}'s site loads in ${bestCompetitorScore}s vs your ${prospectScore}s — they're capturing the impatient visitors.`;
        } else {
            urgencyStatement = `${competitorName} recently updated their website and now scores ${bestCompetitorScore} on ${category} vs your ${prospectScore}.`;
        }
    } else {
        urgencyStatement = 'Competitors are actively improving — now is the time to close the gap.';
    }

    // Build comparison table rows
    const comparisonTableRows: ComparisonTableRow[] = [];
    const metricConfigs: Array<{ key: string; label: string; format: (v: number) => string; lowerBetter?: boolean }> = [
        { key: 'performanceScore', label: 'Overall Score', format: (v) => String(Math.round(v)), lowerBetter: false },
        { key: 'mobileScore', label: 'Mobile Speed', format: (v) => String(Math.round(v)), lowerBetter: false },
        { key: 'loadTimeSeconds', label: 'Load Time (s)', format: (v) => `${v.toFixed(1)}s`, lowerBetter: true },
        { key: 'seoScore', label: 'SEO Score', format: (v) => String(Math.round(v)), lowerBetter: false },
        { key: 'accessibilityScore', label: 'Accessibility', format: (v) => String(Math.round(v)), lowerBetter: false },
        { key: 'rating', label: 'Google Rating', format: (v) => `${v.toFixed(1)}★`, lowerBetter: false },
        { key: 'reviewCount', label: 'Reviews', format: (v) => String(Math.round(v)), lowerBetter: false },
    ];

    let prospectWins = 0;
    let prospectLoses = 0;

    for (const { key, label, format, lowerBetter } of metricConfigs) {
        const pVal = getMetricValue(prospect, key);
        if (pVal === 0 && key !== 'loadTimeSeconds') continue;

        const compVals = competitors.map((c) => ({ name: c.name, val: getMetricValue(c, key) })).filter((x) => x.val > 0 || key === 'loadTimeSeconds');
        if (compVals.length === 0) continue;

        const bestCompVal = lowerBetter ? Math.min(...compVals.map((x) => x.val)) : Math.max(...compVals.map((x) => x.val));
        const prospectWinsMetric = lowerBetter ? pVal < bestCompVal : pVal > bestCompVal;
        const prospectTie = lowerBetter ? pVal === bestCompVal : pVal === bestCompVal;

        if (prospectWinsMetric) prospectWins++;
        else if (!prospectTie) prospectLoses++;

        const prospectStatus: 'win' | 'lose' | 'tie' = prospectWinsMetric ? 'win' : prospectTie ? 'tie' : 'lose';

        const competitorValues = compVals.map(({ name, val }) => {
            const compWins = lowerBetter ? val < pVal : val > pVal;
            const compTie = val === pVal;
            const status: 'win' | 'lose' | 'tie' = compWins ? 'win' : compTie ? 'tie' : 'lose';
            return { name, value: format(val), status };
        });

        comparisonTableRows.push({
            metric: label,
            prospectValue: format(pVal),
            prospectStatus,
            competitorValues,
        });
    }

    const totalMetrics = comparisonTableRows.length;
    const summaryRow = totalMetrics > 0
        ? prospectWins >= prospectLoses
            ? `You're winning on ${prospectWins}/${totalMetrics} metrics`
            : `Your competitors lead on ${prospectLoses}/${totalMetrics} metrics`
        : '';

    // Where ahead / behind (specific numbers)
    const whereAhead: string[] = [];
    const whereBehind: string[] = [];

    for (const row of comparisonTableRows) {
        if (row.prospectStatus === 'win' && whereAhead.length < 3) {
            const comp = row.competitorValues[0];
            whereAhead.push(`Your ${row.metric.toLowerCase()} (${row.prospectValue}) beats ${comp?.name || 'competitors'} (${comp?.value ?? '—'})`);
        }
        if (row.prospectStatus === 'lose' && whereBehind.length < 3) {
            const bestComp = row.competitorValues.find((c) => c.status === 'win') || row.competitorValues[0];
            if (bestComp) {
                whereBehind.push(`${bestComp.name}'s ${row.metric.toLowerCase()} (${bestComp.value}) beats yours (${row.prospectValue})`);
            }
        }
    }

    // Fallback from biggestGap / winningCategories
    if (whereAhead.length === 0 && winningCategories.length > 0) {
        whereAhead.push(positiveStatement);
    }
    if (whereBehind.length === 0 && biggestGap) {
        const { competitorName, category, prospectScore, bestCompetitorScore } = biggestGap;
        const metricKey = Object.entries(METRIC_LABELS).find(([, v]) => v === category)?.[0] || '';
        if (LOWER_IS_BETTER.has(metricKey)) {
            whereBehind.push(`Your site loads in ${prospectScore}s vs ${competitorName}'s ${bestCompetitorScore}s — they're capturing impatient visitors`);
        } else {
            whereBehind.push(`${competitorName} scores ${bestCompetitorScore} on ${category} vs your ${prospectScore}`);
        }
    }

    const quickWins: ComparisonReport['quickWins'] = [];

    if (prospect.performanceScore != null && prospect.performanceScore < 70) {
        const bestPerf = Math.max(...competitors.map((c) => c.performanceScore ?? 0), 0);
        if (bestPerf > prospect.performanceScore) {
            quickWins.push({
                action: 'Optimize images and enable caching to improve PageSpeed score',
                effortEstimate: '2-4 hours',
                expectedImpact: `Could gain 20-40 points, potentially overtaking ${competitors.find((c) => (c.performanceScore ?? 0) === bestPerf)?.name || 'competitors'}`,
            });
        }
    }
    if (prospect.loadTimeSeconds != null && prospect.loadTimeSeconds > 3) {
        const fastest = Math.min(...competitors.map((c) => c.loadTimeSeconds ?? 999).filter((v) => v > 0), 999);
        if (fastest < prospect.loadTimeSeconds && fastest > 0) {
            quickWins.push({
                action: 'Reduce page load time with CDN and code splitting',
                effortEstimate: '1-2 days',
                expectedImpact: `Target under ${fastest}s to match or beat competitor load times`,
            });
        }
    }
    if ((prospect.reviewCount ?? 0) < Math.max(...competitors.map((c) => c.reviewCount ?? 0), 0)) {
        quickWins.push({
            action: 'Launch a review request campaign to close the review gap',
            effortEstimate: 'Ongoing (30 min/week)',
            expectedImpact: 'Each new review improves trust and local ranking',
        });
    }

    return {
        prospect,
        competitors,
        prospectRank,
        winningCategories,
        losingCategories,
        biggestGap,
        summaryStatement,
        positiveStatement,
        urgencyStatement,
        quickWins: quickWins.slice(0, 3),
        comparisonTableRows,
        summaryRow,
        whereAhead: whereAhead.slice(0, 3),
        whereBehind: whereBehind.slice(0, 3),
    };
}
