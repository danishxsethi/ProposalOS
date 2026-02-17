#!/usr/bin/env npx tsx
import 'dotenv/config';
import { prisma } from '@/lib/prisma';

function toWeekStart(date: Date): string {
    const d = new Date(date);
    const day = (d.getUTCDay() + 6) % 7; // Monday
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
}

function parseWeeksArg(): number {
    const arg = process.argv.find((a) => a.startsWith('--weeks='));
    const value = arg ? Number(arg.split('=')[1]) : 8;
    if (!Number.isFinite(value) || value < 1) return 8;
    return Math.floor(value);
}

async function main(): Promise<void> {
    const weeks = parseWeeksArg();
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - weeks * 7);
    start.setUTCHours(0, 0, 0, 0);

    const proposals = await prisma.proposal.findMany({
        where: { createdAt: { gte: start } },
        select: {
            createdAt: true,
            clientScore: true,
            humanCloseabilityScore: true,
            replyReceivedAt: true,
            meetingBookedAt: true,
            tierChosen: true,
            outcome: true,
            status: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    if (proposals.length === 0) {
        console.log(`No proposals found for the last ${weeks} week(s).`);
        return;
    }

    const byWeek = new Map<string, {
        total: number;
        clientScoreSum: number;
        clientScoreCount: number;
        closeabilitySum: number;
        closeabilityCount: number;
        replies: number;
        meetings: number;
        accepted: number;
        tierChosen: number;
    }>();

    for (const p of proposals) {
        const week = toWeekStart(p.createdAt);
        if (!byWeek.has(week)) {
            byWeek.set(week, {
                total: 0,
                clientScoreSum: 0,
                clientScoreCount: 0,
                closeabilitySum: 0,
                closeabilityCount: 0,
                replies: 0,
                meetings: 0,
                accepted: 0,
                tierChosen: 0,
            });
        }

        const row = byWeek.get(week)!;
        row.total += 1;
        if (typeof p.clientScore === 'number') {
            row.clientScoreSum += p.clientScore;
            row.clientScoreCount += 1;
        }
        if (typeof p.humanCloseabilityScore === 'number') {
            row.closeabilitySum += p.humanCloseabilityScore;
            row.closeabilityCount += 1;
        }
        if (p.replyReceivedAt) row.replies += 1;
        if (p.meetingBookedAt) row.meetings += 1;
        if (p.outcome === 'WON' || p.status === 'ACCEPTED') row.accepted += 1;
        if (p.tierChosen) row.tierChosen += 1;
    }

    const rows = Array.from(byWeek.entries()).map(([week, row]) => {
        const replyRate = (row.replies / row.total) * 100;
        const meetingRate = (row.meetings / row.total) * 100;
        const acceptedRate = (row.accepted / row.total) * 100;
        const tierRate = (row.tierChosen / row.total) * 100;
        const realClientPerfectScore =
            replyRate * 0.25 +
            meetingRate * 0.25 +
            acceptedRate * 0.35 +
            tierRate * 0.15;

        return {
            week,
            total: row.total,
            avgClientScore: row.clientScoreCount > 0 ? row.clientScoreSum / row.clientScoreCount : 0,
            avgCloseability: row.closeabilityCount > 0 ? row.closeabilitySum / row.closeabilityCount : 0,
            replyRate,
            meetingRate,
            acceptedRate,
            tierRate,
            realClientPerfectScore,
        };
    });

    console.log(`\nWeekly client-perfect feedback (${weeks} week window)\n`);
    console.log('week       total  avgClient  closeability  reply%  meeting%  accepted%  tier%  realClient%');
    console.log('-----------------------------------------------------------------------------------------------');
    for (const r of rows) {
        console.log(
            `${r.week}  ${String(r.total).padStart(5)}  ${r.avgClientScore.toFixed(1).padStart(9)}  ${r.avgCloseability.toFixed(1).padStart(12)}  ${r.replyRate.toFixed(1).padStart(6)}  ${r.meetingRate.toFixed(1).padStart(8)}  ${r.acceptedRate.toFixed(1).padStart(9)}  ${r.tierRate.toFixed(1).padStart(5)}  ${r.realClientPerfectScore.toFixed(1).padStart(10)}`
        );
    }

    const latest = rows[rows.length - 1];
    if (!latest) return;

    console.log('\nPrompt tuning focus for current week:');
    if (latest.avgCloseability < 8) {
        console.log('- Improve tone/trust framing in executive summary and CTA language.');
    }
    if (latest.replyRate < 20) {
        console.log('- Tighten first CTA and reduce friction in next-step ask.');
    }
    if (latest.meetingRate < 15) {
        console.log('- Add stronger time-boxed offer and calendar-first call to action.');
    }
    if (latest.acceptedRate < 10) {
        console.log('- Rebalance tier packaging to make Growth offer clearer and lower risk.');
    }
    if (latest.tierRate < 30) {
        console.log('- Make tier recommendation explicit and tie it directly to top 3 findings.');
    }
    if (
        latest.avgCloseability >= 8 &&
        latest.replyRate >= 20 &&
        latest.meetingRate >= 15 &&
        latest.acceptedRate >= 10 &&
        latest.tierRate >= 30
    ) {
        console.log('- Maintain current prompts; metrics are tracking above baseline.');
    }
}

main()
    .catch((error) => {
        console.error('Weekly client-perfect feedback failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
