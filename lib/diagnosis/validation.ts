import { Finding, PainCluster } from './types';

/**
 * Score cluster severity based on finding impact scores
 */
export function scoreCluster(findings: Finding[]): 'critical' | 'high' | 'medium' | 'low' {
    const impacts = findings.map((f) => f.impactScore);

    // Critical: Contains ≥1 finding with impact ≥9, OR ≥3 findings with impact ≥7
    if (impacts.some((i) => i >= 9) || impacts.filter((i) => i >= 7).length >= 3) {
        return 'critical';
    }

    // High: Contains ≥1 finding with impact ≥7, OR ≥3 findings with impact ≥5
    if (impacts.some((i) => i >= 7) || impacts.filter((i) => i >= 5).length >= 3) {
        return 'high';
    }

    // Medium: Average impact ≥5
    const avgImpact = impacts.reduce((sum, i) => sum + i, 0) / impacts.length;
    if (avgImpact >= 5) {
        return 'medium';
    }

    return 'low';
}

/**
 * Validate that clusters account for all findings
 */
export function validateClusters(
    clusters: PainCluster[],
    originalFindings: Finding[]
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Get all finding IDs from clusters
    const clusteredIds = new Set<string>();
    for (const cluster of clusters) {
        for (const id of cluster.findingIds) {
            if (clusteredIds.has(id)) {
                errors.push(`Finding ${id} appears in multiple clusters`);
            }
            clusteredIds.add(id);
        }
    }

    // Check if all findings are accounted for
    for (const finding of originalFindings) {
        if (!clusteredIds.has(finding.id)) {
            errors.push(`Finding ${finding.id} not included in any cluster`);
        }
    }

    // Check for invalid finding IDs
    const validIds = new Set(originalFindings.map((f) => f.id));
    for (const id of clusteredIds) {
        if (!validIds.has(id)) {
            errors.push(`Cluster references non-existent finding ${id}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
