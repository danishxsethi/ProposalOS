#!/usr/bin/env npx tsx
/**
 * Fix the latest proposal's executive summary so it passes the "≥2 metrics" QA check.
 * Applies the same cleanup + metrics sentence as the pipeline, then re-runs QA and updates DB.
 * No HTTP server or server-only imports required.
 *
 * Usage: npx tsx scripts/regenerate-one-proposal-summary.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { prisma } from '@/lib/prisma';
import { runAutoQA } from '@/lib/qa/autoQA';
import { hardenExecutiveSummaryForQA } from '@/lib/proposal/executiveSummaryQa';
import type { Finding } from '@prisma/client';
import type { ProposalResult } from '@/lib/proposal/types';

function fixSummary(text: string, findings: Finding[], businessName: string, city: string | null): string {
    const painkillers = findings.filter((f) => f.type === 'PAINKILLER').length;
    return hardenExecutiveSummaryForQA(text || '', businessName, city, findings.length, painkillers);
}

async function main() {
    const proposal = await prisma.proposal.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { audit: { include: { findings: true } } },
    });
    if (!proposal || !proposal.audit) {
        console.log('No proposal with audit found.');
        process.exit(1);
    }
    const audit = proposal.audit as { businessName: string; businessCity: string | null; findings: Finding[] };
    if (!audit.findings || audit.findings.length === 0) {
        console.log('Audit has no findings.');
        process.exit(1);
    }

    console.log('Fixing summary for proposal', proposal.id, '|', audit.businessName);

    const newSummary = fixSummary(
        proposal.executiveSummary ?? '',
        audit.findings,
        audit.businessName,
        audit.businessCity
    );

    const proposalForQA: ProposalResult = {
        executiveSummary: newSummary,
        painClusters: (proposal.painClusters as unknown as ProposalResult['painClusters']) ?? [],
        tiers: {
            essentials: proposal.tierEssentials as unknown as ProposalResult['tiers']['essentials'],
            growth: proposal.tierGrowth as unknown as ProposalResult['tiers']['growth'],
            premium: proposal.tierPremium as unknown as ProposalResult['tiers']['premium'],
        },
        pricing: (proposal.pricing as unknown as ProposalResult['pricing']) ?? { essentials: 0, growth: 0, premium: 0, currency: 'USD' },
        assumptions: proposal.assumptions ?? [],
        disclaimers: proposal.disclaimers ?? [],
        nextSteps: proposal.nextSteps ?? [],
    };
    const qaStatus = runAutoQA(proposalForQA, audit.findings, audit.businessName, audit.businessCity);

    await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
            executiveSummary: newSummary,
            qaScore: qaStatus.score,
            qaResults: JSON.parse(JSON.stringify(qaStatus)),
        },
    });

    console.log('Updated. New QA score:', qaStatus.score);
    const metricCheck = qaStatus.results?.find((r) => r.check.includes('Metrics'));
    console.log('Metric check:', metricCheck?.passed ? '✅' : '❌', metricCheck?.details ?? '');
    console.log('\nExecutive summary:\n', newSummary.slice(0, 550));
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
