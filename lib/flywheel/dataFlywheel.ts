import { prisma } from '@/lib/prisma';

// 1. BENCHMARK AUTO-CALIBRATION
export async function updateBenchmark(industry: string, metrics: any) {
    if (!industry || industry === 'Unknown') return;

    try {
        // Fetch existing
        const stat = await prisma.benchmarkStats.findUnique({
            where: { industry_city: { industry, city: 'Global' } } // flattened unique key logic in Prisma? No, use composite
        }) || await prisma.benchmarkStats.create({
            data: { industry, city: 'Global', metrics: {} }
        });

        // Simple Rolling Average (for MVP)
        // New Avg = ((Old Avg * N) + New Val) / (N + 1)
        const n = stat.sampleSize;
        const currentMetrics = stat.metrics as Record<string, number>;
        const newMetrics = { ...currentMetrics };

        // Identify numeric keys in input metrics to average
        for (const [key, value] of Object.entries(metrics)) {
            if (typeof value === 'number') {
                const oldVal = currentMetrics[key] || value; // Seed with first value if missing
                newMetrics[key] = ((oldVal * n) + value) / (n + 1);
            }
        }

        await prisma.benchmarkStats.update({
            where: { id: stat.id },
            data: {
                sampleSize: { increment: 1 },
                metrics: newMetrics,
                lastUpdated: new Date()
            }
        });

        console.log(\`[Flywheel] Updated benchmark for \${industry}. Size: \${n + 1}\`);

    } catch (error) {
        console.error('[Flywheel] Benchmark update failed', error);
    }
}

// 2. FINDING EFFECTIVENESS
export async function trackFindingOutcome(findingType: string, accepted: boolean) {
    try {
        const stat = await prisma.findingEffectiveness.upsert({
            where: { findingType },
            create: { findingType, totalOccurrences: 0, acceptedCount: 0 },
            update: {}
        });
        
        const newTotal = stat.totalOccurrences + 1;
        const newAccepted = stat.acceptedCount + (accepted ? 1 : 0);
        
        await prisma.findingEffectiveness.update({
             where: { findingType },
             data: {
                 totalOccurrences: newTotal,
                 acceptedCount: newAccepted,
                 conversionPower: newTotal > 0 ? (newAccepted / newTotal) : 0
             }
        });
    } catch (error) {
        console.error('[Flywheel] Finding tracking failed', error);
    }
}

// 3. PROMPT PERFORMANCE
export async function trackPromptOutcome(promptId: string, outcome: { qaScore?: number, accepted?: boolean }) {
    try {
         const stat = await prisma.promptPerformance.upsert({
            where: { promptId },
            create: { promptId, uses: 0, avgQaScore: 0, acceptanceRate: 0 },
            update: {}
        });

        let newUses = stat.uses + 1;
        let newQa = stat.avgQaScore;
        let newRate = stat.acceptanceRate;

        if (outcome.qaScore !== undefined) {
            // Rolling avg for QA
            newQa = ((stat.avgQaScore * stat.uses) + outcome.qaScore) / newUses;
        }

        if (outcome.accepted !== undefined) {
             // Rolling avg for Acceptance (Need to track accumulated accepts really, but simplified here)
             // Sim: estimated accepted count
             const estAccepted = stat.acceptanceRate * stat.uses;
             const newAcceptedCount = estAccepted + (outcome.accepted ? 1 : 0);
             newRate = newAcceptedCount / newUses;
        }

        await prisma.promptPerformance.update({
             where: { promptId },
             data: {
                 uses: newUses,
                 avgQaScore: newQa,
                 acceptanceRate: newRate
             }
        });

    } catch (error) {
        console.error('[Flywheel] Prompt tracking failed', error);
    }
}
