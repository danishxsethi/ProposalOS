#!/usr/bin/env npx tsx
/**
 * Re-harden executive summaries and recompute QA/status for existing proposals.
 * Useful for lifting historical runs to agency-grade after QA hardening updates.
 *
 * Usage:
 *   node --import tsx scripts/regenerate-proposal-summaries.ts
 *   node --import tsx scripts/regenerate-proposal-summaries.ts --below 90 --limit 100
 *   node --import tsx scripts/regenerate-proposal-summaries.ts --all --dry-run
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { prisma } from '@/lib/prisma';
import { runAutoQA } from '@/lib/qa/autoQA';
import { hardenExecutiveSummaryForQA } from '@/lib/proposal/executiveSummaryQa';
import type { Finding, ProposalStatus } from '@prisma/client';
import type { ProposalResult } from '@/lib/proposal/types';

interface Args {
    all: boolean;
    dryRun: boolean;
    limit?: number;
    below: number;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const all = argv.includes('--all');
    const dryRun = argv.includes('--dry-run');
    const limitArg = argv.find((a) => a.startsWith('--limit='))?.split('=')[1]
        ?? (argv.includes('--limit') ? argv[argv.indexOf('--limit') + 1] : undefined);
    const belowArg = argv.find((a) => a.startsWith('--below='))?.split('=')[1]
        ?? (argv.includes('--below') ? argv[argv.indexOf('--below') + 1] : undefined);
    const limit = limitArg ? Math.max(1, parseInt(limitArg, 10)) : undefined;
    const below = belowArg ? Math.max(1, parseInt(belowArg, 10)) : 90;
    return { all, dryRun, limit, below };
}

function toProposalResultForQA(
    executiveSummary: string,
    proposal: {
        painClusters: unknown;
        tierEssentials: unknown;
        tierGrowth: unknown;
        tierPremium: unknown;
        pricing: unknown;
        assumptions: string[];
        disclaimers: string[];
        nextSteps: string[];
    }
): ProposalResult {
    return {
        executiveSummary,
        painClusters: (proposal.painClusters as unknown as ProposalResult['painClusters']) ?? [],
        tiers: {
            essentials: proposal.tierEssentials as unknown as ProposalResult['tiers']['essentials'],
            growth: proposal.tierGrowth as unknown as ProposalResult['tiers']['growth'],
            premium: proposal.tierPremium as unknown as ProposalResult['tiers']['premium'],
        },
        pricing: (proposal.pricing as unknown as ProposalResult['pricing']) ?? {
            essentials: 0,
            growth: 0,
            premium: 0,
            currency: 'USD',
        },
        assumptions: proposal.assumptions ?? [],
        disclaimers: proposal.disclaimers ?? [],
        nextSteps: proposal.nextSteps ?? [],
    };
}

function decideStatus(score: number, needsReview: boolean): ProposalStatus {
    const agencyGrade = score >= 90;
    return agencyGrade || (score >= 60 && !needsReview) ? 'READY' : 'DRAFT';
}

async function main() {
    const args = parseArgs();

    const where = args.all
        ? {}
        : { OR: [{ qaScore: null }, { qaScore: { lt: args.below } }] };

    const proposals = await prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: args.limit,
        include: {
            audit: {
                include: {
                    findings: true,
                },
            },
        },
    });

    if (proposals.length === 0) {
        console.log('No proposals matched filter.');
        return;
    }

    console.log(`Found ${proposals.length} proposal(s) to process.`);

    let improved = 0;
    let agencyGrade = 0;
    let unchanged = 0;
    let degraded = 0;

    for (const p of proposals) {
        const audit = p.audit as { businessName: string; businessCity: string | null; findings: Finding[] } | null;
        if (!audit || !audit.findings || audit.findings.length === 0) {
            console.log(`- ${p.id}: skipped (missing audit/findings)`);
            continue;
        }

        const painkillers = audit.findings.filter((f) => f.type === 'PAINKILLER').length;
        const hardenedSummary = hardenExecutiveSummaryForQA(
            p.executiveSummary ?? '',
            audit.businessName,
            audit.businessCity,
            audit.findings.length,
            painkillers
        );

        const proposalForQA = toProposalResultForQA(hardenedSummary, {
            painClusters: p.painClusters,
            tierEssentials: p.tierEssentials,
            tierGrowth: p.tierGrowth,
            tierPremium: p.tierPremium,
            pricing: p.pricing,
            assumptions: p.assumptions,
            disclaimers: p.disclaimers,
            nextSteps: p.nextSteps,
        });

        const qaStatus = runAutoQA(proposalForQA, audit.findings, audit.businessName, audit.businessCity);
        const prev = p.qaScore ?? 0;
        const next = qaStatus.score;
        const status = decideStatus(next, qaStatus.needsReview);

        if (next > prev) improved++;
        else if (next < prev) degraded++;
        else unchanged++;
        if (next >= 90) agencyGrade++;

        console.log(`- ${p.id}: ${prev}% -> ${next}% (${status})`);

        if (!args.dryRun) {
            await prisma.proposal.update({
                where: { id: p.id },
                data: {
                    executiveSummary: hardenedSummary,
                    qaScore: next,
                    qaResults: JSON.parse(JSON.stringify(qaStatus)),
                    status,
                },
            });
        }
    }

    console.log('\nSummary:');
    console.log(`- Improved: ${improved}`);
    console.log(`- Unchanged: ${unchanged}`);
    console.log(`- Degraded: ${degraded}`);
    console.log(`- Agency-grade (>=90): ${agencyGrade}`);
    console.log(args.dryRun ? '- Mode: DRY RUN (no DB writes)' : '- Mode: APPLY');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
