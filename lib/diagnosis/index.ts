/**
 * @deprecated Use diagnosisGraph.invoke() from lib/graph/diagnosis-graph.ts instead.
 * This file will be deleted in v2.0. The LangGraph path includes evidence verification,
 * QA retry loops, and adversarial checking which this raw execution path misses.
 */
/**
 * Main diagnosis pipeline
 * Orchestrates: pre-cluster → LLM cluster → validate → narrate
 * @param playbook Optional vertical playbook — influences prioritization and benchmarks
 */
import { RunTree } from 'langsmith';

import { CostTracker } from '@/lib/costs/costTracker';
import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import type { VerticalPlaybook } from '@/lib/playbooks/types';
import { prisma } from '@/lib/prisma';

import { DiagnosisResult, Finding } from './types';

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
  console.warn('[DEPRECATED] runDiagnosisPipeline called — delegating to diagnosisGraph');

  // Assume all findings belong to the same audit
  const auditId = findings.length > 0 ? findings[0]?.auditId : undefined;
  const tenantId = findings.length > 0 ? findings[0]?.tenantId : 'unknown';

  let evidenceSnapshots: any[] = [];
  if (auditId) {
    evidenceSnapshots = await prisma.evidenceSnapshot.findMany({
      where: { auditId },
    });
  }

  // Delegate to the LangGraph (which has QA, evidence verification, retries)
  const result = await invokeDiagnosisGraphWithTimeout({
    findings,
    evidenceSnapshots,
    tenantId,
    auditId,
    mode: 'MULTI_STEP',
    costTracker: tracker,
  });

  return {
    clusters: result.clusters,
    metadata: {
      totalFindings: findings.length,
      clusteredFindings: result.clusters.reduce(
        (sum: number, c: any) => sum + c.findingIds.length,
        0
      ),
      clusteringConfidence: result.validation?.valid ? 0.9 : 0.6, // Lower if validation failed
    },
  };
}
