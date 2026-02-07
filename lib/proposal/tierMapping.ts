import { Finding } from '@prisma/client';
import { PainCluster } from '../diagnosis/types';
import { TierMapping } from './types';

/**
 * Map pain clusters to 3 tiers based on impact and effort
 * 
 * Essentials: High-impact, low-effort (quick wins)
 * Growth: Medium impact/effort (competitive improvements)
 * Premium: Everything (comprehensive solution)
 */
export function mapToTiers(
    clusters: PainCluster[],
    findings: Finding[]
): TierMapping {
    const essentials: string[] = [];
    const growth: string[] = [];
    const premium: string[] = [];

    // Get finding details
    const findingMap = new Map(findings.map((f) => [f.id, f]));

    for (const cluster of clusters) {
        for (const findingId of cluster.findingIds) {
            const finding = findingMap.get(findingId);
            if (!finding) continue;

            const impact = finding.impactScore;
            const effort = finding.effortEstimate || 'MEDIUM';

            // Essentials: High impact (≥7) + Low effort
            if (impact >= 7 && effort === 'LOW') {
                essentials.push(findingId);
            }
            // Growth: Medium-high impact (≥5) OR Medium effort
            else if (impact >= 5 || effort === 'MEDIUM') {
                growth.push(findingId);
            }
            // Premium: Everything else
            else {
                premium.push(findingId);
            }
        }
    }

    // Ensure essentials has at least 3 items (move from growth if needed)
    if (essentials.length < 3 && growth.length > 0) {
        const toMove = Math.min(3 - essentials.length, growth.length);
        essentials.push(...growth.splice(0, toMove));
    }

    // Ensure each tier has at least 2 items
    if (growth.length < 2 && premium.length > 0) {
        growth.push(...premium.splice(0, Math.min(2, premium.length)));
    }

    // Premium includes everything (cumulative)
    const allIds = [...new Set([...essentials, ...growth, ...premium])];

    return {
        essentials,
        growth: [...essentials, ...growth],
        premium: allIds,
    };
}
