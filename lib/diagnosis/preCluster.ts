import { Finding, PreCluster } from './types';

/**
 * Pre-cluster findings by module + category
 * This reduces the LLM's workload and improves clustering stability
 */
export function preClusterFindings(findings: Finding[]): PreCluster[] {
    const groups: Record<string, Finding[]> = {};

    for (const finding of findings) {
        const key = `${finding.module}:${finding.category}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(finding);
    }

    // Convert to PreCluster array
    const preClusters: PreCluster[] = Object.entries(groups).map(([key, findings]) => ({
        key,
        findings,
    }));

    // Merge small groups (<2 findings) into "Other Issues"
    const largeClusters = preClusters.filter((c) => c.findings.length >= 2);
    const smallClusters = preClusters.filter((c) => c.findings.length < 2);

    if (smallClusters.length > 0) {
        const otherFindings = smallClusters.flatMap((c) => c.findings);
        if (otherFindings.length > 0) {
            largeClusters.push({
                key: 'other:misc',
                findings: otherFindings,
            });
        }
    }

    return largeClusters;
}
