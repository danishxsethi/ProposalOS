import { Finding, DiagnosisResult } from './types';
import { preClusterFindings } from './preCluster';
import { llmClusterFindings, generateNarratives } from './llmCluster';
import { validateClusters } from './validation';

import { CostTracker } from '@/lib/costs/costTracker';
import { RunTree } from 'langsmith';
import type { VerticalPlaybook } from '@/lib/playbooks/types';

/**
 * Main diagnosis pipeline
 * Orchestrates: pre-cluster → LLM cluster → validate → narrate
 * @param playbook Optional vertical playbook — influences prioritization and benchmarks
 */
export async function runDiagnosisPipeline(
    findings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree,
    playbook?: VerticalPlaybook | null
): Promise<DiagnosisResult> {
    console.log(`[DiagnosisPipeline] Processing ${findings.length} findings...${playbook ? ` (vertical: ${playbook.id})` : ''}`);

    // Step 1: Pre-cluster (rule-based)
    const preClusters = preClusterFindings(findings);
    console.log(`[DiagnosisPipeline] Pre-clustered into ${preClusters.length} groups`);

    // Step 2: LLM refine clusters (playbook.priorityFindings can influence clustering context)
    let clusters = await llmClusterFindings(preClusters, findings, tracker, parentTrace, playbook ?? undefined);
    console.log(`[DiagnosisPipeline] LLM refined into ${clusters.length} clusters`);

    // Step 3: Validate
    const validation = validateClusters(clusters, findings);
    if (!validation.valid) {
        console.error('[DiagnosisPipeline] Validation failed:', validation.errors);

        // Retry logic: If validation fails, fall back to pre-clusters
        console.log('[DiagnosisPipeline] Falling back to pre-clusters');
        clusters = preClusters.map((pc, idx) => ({
            id: `cluster-${idx + 1}`,
            rootCause: `Issues with ${pc.key}`,
            severity: 'medium' as const,
            findingIds: pc.findings.map((f) => f.id),
        }));
    }

    // Step 4: Generate narratives (playbook influences industry context)
    const narrativeClusters = await generateNarratives(clusters, findings, tracker, parentTrace, playbook ?? undefined);
    console.log(`[DiagnosisPipeline] Generated narratives for ${narrativeClusters.length} clusters`);

    return {
        clusters: narrativeClusters,
        metadata: {
            totalFindings: findings.length,
            clusteredFindings: narrativeClusters.reduce((sum, c) => sum + c.findingIds.length, 0),
            clusteringConfidence: validation.valid ? 0.9 : 0.6, // Lower if validation failed
        },
    };
}
