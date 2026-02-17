#!/usr/bin/env npx ts-node
/**
 * Test GBP completeness module with real Saskatoon businesses.
 * Usage: npx ts-node scripts/test-gbp-completeness.ts
 *
 * Requires: GOOGLE_PLACES_API_KEY
 * Optional: SERP_API_KEY, GOOGLE_PAGESPEED_API_KEY (for competitor comparison)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { runGBPModule } from '@/lib/modules/gbp';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { computeGbpCompleteness, type CompetitorGbpData } from '@/lib/analysis/gbpCompleteness';

const TEST_BUSINESSES = [
    { name: "Joe's Plumbing", city: 'Saskatoon', url: 'https://joesplumbing.ca' },
    { name: 'Boston Pizza', city: 'Saskatoon', url: 'https://www.bostonpizza.com' },
    { name: 'Saskatoon Co-op', city: 'Saskatoon', url: 'https://www.saskatooncoop.ca' },
];

/** Rough competitor score from limited data */
function roughCompetitorScore(c: { photosCount?: number; reviewCount?: number; rating?: number; hasHours?: boolean }): number {
    let s = 0;
    if ((c.photosCount ?? 0) >= 10) s += 15;
    else if ((c.photosCount ?? 0) >= 5) s += 8;
    if ((c.reviewCount ?? 0) >= 20) s += 20;
    else if ((c.reviewCount ?? 0) >= 10) s += 10;
    if ((c.rating ?? 0) >= 4) s += 15;
    if (c.hasHours) s += 10;
    return Math.min(100, s);
}

async function main() {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
        console.error('GOOGLE_PLACES_API_KEY required');
        process.exit(1);
    }

    console.log('\n🧪 Testing GBP Completeness Module\n');

    for (const biz of TEST_BUSINESSES) {
        console.log(`\n--- ${biz.name} (${biz.city}) ---`);
        try {
            const gbpResult = await runGBPModule({
                businessName: biz.name,
                city: biz.city,
                websiteUrl: biz.url,
            });

            if (gbpResult.status !== 'success' || !gbpResult.data) {
                console.log('  ❌ GBP module failed:', gbpResult.error);
                continue;
            }

            const data = gbpResult.data;

            let competitorData: CompetitorGbpData[] | undefined;
            let competitorScores: number[] | undefined;
            try {
                const compResult = await runCompetitorModule({
                    keyword: biz.name,
                    location: biz.city,
                });
                if (compResult.status === 'success' && compResult.data?.topCompetitors) {
                    const comps = compResult.data.topCompetitors as any[];
                    competitorData = comps.map((c) => ({
                        name: c.name,
                        reviewCount: c.reviews ?? c.reviewCount,
                        rating: c.rating,
                        photosCount: c.photosCount,
                        hasHours: c.hasHours,
                    }));
                    competitorScores = comps.map(roughCompetitorScore).filter((s) => s > 0);
                }
            } catch {
                // Competitor fetch optional
            }

            const completeness = computeGbpCompleteness(data, competitorScores, competitorData);

            console.log(`  Score: ${completeness.overallScore}% | Grade: ${completeness.grade}`);
            console.log('  Breakdown:');
            for (const b of completeness.breakdown) {
                const icon = b.present ? '✓' : '✗';
                console.log(`    ${icon} ${b.category}: ${b.score}/${b.maxScore} ${b.detail ? `(${b.detail})` : ''}`);
            }
            if (completeness.competitorComparison?.length) {
                console.log('  Competitor comparison:');
                for (const c of completeness.competitorComparison) {
                    console.log(`    ${c.metric}: You ${c.you} | Competitor: ${c.competitor}`);
                }
            }
            if (completeness.recommendations.length) {
                console.log('  Recommendations:');
                completeness.recommendations.slice(0, 3).forEach((r) => console.log(`    • ${r}`));
            }
        } catch (e) {
            console.error('  ❌ Error:', e instanceof Error ? e.message : e);
        }
    }

    console.log('\n✅ Done\n');
}

main();
