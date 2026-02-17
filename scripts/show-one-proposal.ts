#!/usr/bin/env npx tsx
/**
 * Print one stored proposal (latest by createdAt) for inspection.
 * Usage: npx tsx scripts/show-one-proposal.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const proposal = await prisma.proposal.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { audit: { select: { businessName: true, businessCity: true } } },
    });
    if (!proposal) {
        console.log('No proposals in DB.');
        return;
    }
    const audit = proposal.audit as { businessName?: string; businessCity?: string } | null;
    console.log('--- One proposal (latest in DB) ---\n');
    console.log('Audit:', audit?.businessName ?? 'N/A', '|', audit?.businessCity ?? 'N/A');
    console.log('Proposal ID:', proposal.id);
    console.log('QA Score:', proposal.qaScore ?? 'N/A');
    console.log('Created:', proposal.createdAt.toISOString());
    console.log('\n--- Executive Summary ---\n');
    const summary = proposal.executiveSummary ?? '';
    console.log(summary || '(empty)');
    // Same pattern as autoQA: show whether "≥2 metrics" check would pass
    const metricPattern = /\d+(\.\d+)?(%|\/100|\s*(?:seconds?|ms|scores?|rating|reviews?|\$|points?|findings?|issues?|critical|painkillers?|load|speed|LCP|FCP|CLS|index|MB|kb|stars?|hours?|days?|minutes?|of|out\s+of|visitors?|customers?|bounce|traffic|conversion|percent|percentage))/gi;
    const metricMatches = summary.match(metricPattern) || [];
    console.log('\n--- Metric cites (≥2 required for QA) ---');
    console.log('Count:', metricMatches.length, metricMatches.length >= 2 ? '✅' : '❌');
    if (metricMatches.length > 0) console.log('Matches:', metricMatches.join(', '));
    console.log('\n--- Pricing ---\n');
    console.log(JSON.stringify(proposal.pricing, null, 2));
    console.log('\n--- Tier: Essentials (Starter) ---\n');
    console.log(JSON.stringify(proposal.tierEssentials, null, 2));
    console.log('\n--- Tier: Growth ---\n');
    console.log(JSON.stringify(proposal.tierGrowth, null, 2));
    console.log('\n--- Tier: Premium ---\n');
    console.log(JSON.stringify(proposal.tierPremium, null, 2));
    console.log('\n--- Pain Clusters (count) ---\n');
    const clusters = proposal.painClusters as unknown[];
    console.log(Array.isArray(clusters) ? clusters.length : 0, 'clusters');
    if (proposal.qaResults && typeof proposal.qaResults === 'object') {
        console.log('\n--- QA results (passed/failed) ---\n');
        const qa = proposal.qaResults as { results?: Array<{ check: string; passed: boolean; details?: string }> };
        (qa.results ?? []).forEach((r) => console.log(r.passed ? '  ✅' : '  ❌', r.check, r.details ?? ''));
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
