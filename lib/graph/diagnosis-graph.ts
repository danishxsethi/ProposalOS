/**
 * NOTE (Pipeline 18 — Temporal Cloud Decision):
 * Native LangGraph orchestration is used instead of Temporal Cloud.
 * LangGraph provides built-in state persistence, retry logic, and conditional
 * routing which satisfies all orchestration requirements for this system.
 * Temporal migration is deferred to post-launch if scale demands distributed
 * workflow durability beyond what LangGraph's checkpointing provides.
 */
import { Annotation, StateGraph } from '@langchain/langgraph';

import { AggregatedContext } from '@/lib/context/aggregator';
import {
  generateNarratives,
  llmClusterFindings,
  llmSinglePassClustering,
} from '@/lib/diagnosis/llmCluster';
import { preClusterFindings } from '@/lib/diagnosis/preCluster';
import { Finding, PainCluster } from '@/lib/diagnosis/types';
import { validateClusters } from '@/lib/diagnosis/validation';
import { verifyEvidenceActivity } from '@/lib/graph/activities/verifyEvidence';
import { createAdversarialQAGraph } from '@/lib/graph/adversarial-qa-graph';
import {
  getValidationRetryRoute,
  isPainkillerSeverity,
  MAX_VALIDATION_RETRIES,
} from '@/lib/graph/diagnosis-helpers';
import { DiagnosisCluster, DiagnosisRanking, DiagnosisValidation } from '@/lib/graph/types';
import { logger } from '@/lib/logger';
import { computeHallucinationScore, logQATelemetry } from '@/lib/qa/telemetry';
import { exponentialBackoffMs, sleep } from '@/lib/utils/backoff';

// ─── Node error record ────────────────────────────────────────────────────────
interface NodeError {
  node: string;
  error: string;
  timestamp: string;
}

// ─── State annotations ────────────────────────────────────────────────────────
export const DiagnosisState = Annotation.Root({
  findings: Annotation<Finding[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  clusters: Annotation<DiagnosisCluster[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  rankings: Annotation<DiagnosisRanking[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  painkillers: Annotation<DiagnosisCluster[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  vitamins: Annotation<DiagnosisCluster[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  narrative: Annotation<string>({
    reducer: (x, y) => y,
    default: () => '',
  }),
  validation: Annotation<DiagnosisValidation | null>({
    reducer: (x, y) => y,
    default: () => ({
      valid: true,
      issues: [],
      clusterCount: 0,
      findingsCovered: 0,
      totalFindings: 0,
    }),
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  degraded: Annotation<boolean>({
    reducer: (x, y) => y,
    default: () => false,
  }),
  staleFindingsCount: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  tenantId: Annotation<string>({ reducer: (x, y) => y }),
  // Extended single-pass mode flags
  mode: Annotation<'SINGLE_PASS' | 'MULTI_STEP'>({
    reducer: (x, y) => y,
    default: () => 'MULTI_STEP',
  }),
  aggregatedContext: Annotation<AggregatedContext | undefined>({
    reducer: (x, y) => y,
    default: () => undefined,
  }),
  auditId: Annotation<string | undefined>({ reducer: (x, y) => y }),
  // QA retry tracking
  qaRetryCount: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  // P0-1: QA score threaded through state (was always recomputed as 0 in route_qa)
  lastQaScore: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  // Evidence snapshots for adversarial QA (P1-4: passed to rawEvidence)
  evidenceSnapshots: Annotation<any[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  // P0-2: Accumulated node errors — never causes 500, surfaced in final state
  errors: Annotation<NodeError[]>({
    reducer: (x, y) => [...(x ?? []), ...(y ?? [])],
    default: () => [],
  }),
  costTracker: Annotation<any>({ reducer: (x, y) => y }),
});

type State = typeof DiagnosisState.State;

const MAX_QA_RETRIES = 2;
export const DIAGNOSIS_GRAPH_TIMEOUT_MS = 90_000;

// ─── Helper ───────────────────────────────────────────────────────────────────
function nodeError(node: string, error: unknown): NodeError {
  return { node, error: String(error), timestamp: new Date().toISOString() };
}

// ─── Nodes (P0-2: every node now has try/catch with safe fallback) ─────────────

// P1-4: Use real evidence for stale checks
async function verify_evidence(state: State): Promise<Partial<State>> {
  try {
    const { findings, staleCount } = await verifyEvidenceActivity(state.findings);
    return { findings, staleFindingsCount: staleCount };
  } catch (error) {
    // On error skip verification — do NOT block the pipeline
    logger.error(
      { node: 'verify_evidence', error },
      '[LangGraph] verify_evidence failed — skipping verification'
    );
    return {
      findings: state.findings, // pass through unchanged
      staleFindingsCount: 0,
      errors: [nodeError('verify_evidence', error)],
    };
  }
}

async function cluster_root_causes(state: State): Promise<Partial<State>> {
  try {
    let painClusters: any[];
    if (state.mode === 'SINGLE_PASS' && state.aggregatedContext) {
      painClusters = await llmSinglePassClustering(state.aggregatedContext, state.findings);
    } else {
      const pre = preClusterFindings(state.findings);
      painClusters = await llmClusterFindings(
        pre,
        state.findings,
        state.costTracker,
        undefined,
        undefined
      );
    }

    const clusters: DiagnosisCluster[] = painClusters.map((c) => ({
      id: c.id,
      title: c.rootCause,
      description: c.rootCause,
      severity: c.severity,
      findingIds: c.findingIds,
      findings: state.findings.filter((f) => c.findingIds.includes(f.id)),
      rootCause: c.rootCause,
      narrative: c.narrative,
    }));

    return { clusters };
  } catch (error) {
    logger.error(
      { node: 'cluster_root_causes', error },
      '[LangGraph] cluster_root_causes failed — using single fallback cluster'
    );
    // Fallback: single cluster containing all finding IDs
    const fallbackCluster: DiagnosisCluster = {
      id: 'fallback-cluster-1',
      title: 'Multiple issues detected across the business',
      description: 'Multiple issues detected across the business',
      rootCause: 'Multiple issues detected across the business',
      severity: 'medium',
      findingIds: state.findings.map((f) => f.id),
      findings: state.findings,
    };
    return {
      clusters: [fallbackCluster],
      degraded: true,
      errors: [nodeError('cluster_root_causes', error)],
    };
  }
}

async function rank_by_impact(state: State): Promise<Partial<State>> {
  try {
    const rankings: DiagnosisRanking[] = state.clusters.map((c, idx) => ({
      clusterId: c.id,
      rank: idx + 1,
      impactScore: c.severity === 'critical' ? 100 : c.severity === 'high' ? 80 : 50,
      estimatedROI: 1000,
      effortLevel: 'moderate', // placeholder or logic if available
    }));
    return { rankings };
  } catch (error) {
    logger.error({ node: 'rank_by_impact', error }, '[LangGraph] rank_by_impact failed');
    return {
      rankings: [],
      errors: [nodeError('rank_by_impact', error)],
    };
  }
}

async function classify_painkillers(state: State): Promise<Partial<State>> {
  try {
    return { painkillers: state.clusters.filter((c) => isPainkillerSeverity(c.severity)) };
  } catch (error) {
    logger.error(
      { node: 'classify_painkillers', error },
      '[LangGraph] classify_painkillers failed'
    );
    return {
      painkillers: [],
      errors: [nodeError('classify_painkillers', error)],
    };
  }
}

async function classify_vitamins(state: State): Promise<Partial<State>> {
  try {
    return { vitamins: state.clusters.filter((c) => !isPainkillerSeverity(c.severity)) };
  } catch (error) {
    logger.error({ node: 'classify_vitamins', error }, '[LangGraph] classify_vitamins failed');
    return {
      vitamins: [],
      errors: [nodeError('classify_vitamins', error)],
    };
  }
}

async function generate_narrative(state: State): Promise<Partial<State>> {
  try {
    const painClusters = state.clusters.map((c) => ({
      id: c.id,
      rootCause: c.rootCause,
      severity: c.severity,
      findingIds: c.findings.map((f) => f.id),
      narrative: c.narrative,
    }));
    const newClusters = await generateNarratives(
      painClusters as any,
      state.findings,
      undefined,
      undefined,
      undefined
    );

    const clusters = state.clusters.map((c) => {
      const updated = newClusters.find((n) => n.id === c.id);
      return { ...c, narrative: updated?.narrative || c.narrative };
    });

    return { clusters };
  } catch (error) {
    logger.error(
      { node: 'generate_narrative', error },
      '[LangGraph] generate_narrative failed — clusters returned without narratives'
    );
    return {
      // Return clusters as-is without narratives rather than crashing
      clusters: state.clusters,
      errors: [nodeError('generate_narrative', error)],
    };
  }
}

async function validate_diagnosis(state: State): Promise<Partial<State>> {
  try {
    const painClusters = state.clusters.map((c) => ({
      id: c.id,
      rootCause: c.rootCause,
      severity: c.severity,
      findingIds: c.findings.map((f) => f.id),
    }));
    const val = validateClusters(painClusters as any, state.findings);
    const validation = {
      valid: val.valid,
      issues: val.errors || [],
      clusterCount: state.clusters.length,
      findingsCovered: state.clusters.reduce((acc, c) => acc + c.findings.length, 0),
      totalFindings: state.findings.length,
    };
    return { validation };
  } catch (error) {
    logger.error({ node: 'validate_diagnosis', error }, '[LangGraph] validate_diagnosis failed');
    return {
      validation: {
        valid: false,
        issues: [`Validation threw: ${String(error)}`],
        clusterCount: 0,
        findingsCovered: 0,
        totalFindings: 0,
      },
      errors: [nodeError('validate_diagnosis', error)],
    };
  }
}

function route_validation(state: State) {
  if (state.validation?.valid) {
    return 'adversarial_qa';
  }
  return 'prepare_retry';
}

async function prepare_retry(state: State): Promise<Partial<State>> {
  try {
    const retryCount = (state.retryCount || 0) + 1;

    if (retryCount > MAX_VALIDATION_RETRIES) {
      logger.warn(
        { retryCount, maxRetries: MAX_VALIDATION_RETRIES },
        '[LangGraph:prepare_retry] Validation retry cap reached — ending degraded'
      );
      return {
        retryCount,
        degraded: true,
        errors: [
          nodeError('prepare_retry', `Validation retry cap reached (${MAX_VALIDATION_RETRIES})`),
        ],
      };
    }

    const delayMs = exponentialBackoffMs(retryCount);
    logger.warn({ retryCount, delayMs }, '[LangGraph:prepare_retry] Retrying');
    await sleep(delayMs);
    return { retryCount };
  } catch (error) {
    logger.error({ node: 'prepare_retry', error }, '[LangGraph] prepare_retry failed');
    // Increment anyway to prevent infinite loops
    return {
      retryCount: state.retryCount + 1,
      errors: [nodeError('prepare_retry', error)],
    };
  }
}

function route_prepare_retry(state: State): string {
  return getValidationRetryRoute(state.retryCount || 0);
}

async function degrade_and_continue(state: State): Promise<Partial<State>> {
  try {
    logger.warn('[LangGraph:degrade_and_continue] Diagnosis degraded after max retries');
    // Persist degraded state to DB
    if (state.auditId) {
      const { prisma } = await import('@/lib/prisma');
      await prisma.audit.update({
        where: { id: state.auditId },
        data: {
          status: 'DEGRADED',
          error: `Diagnosis degraded: validation failed after ${state.retryCount} retries`,
        } as any,
      });
    }
    return { degraded: true };
  } catch (error) {
    logger.error({ error }, '[LangGraph:degrade_and_continue] Error persisting degraded state');
    return { degraded: true, errors: [nodeError('degrade_and_continue', error)] };
  }
}

async function adversarial_qa(state: State): Promise<Partial<State>> {
  try {
    const content = state.clusters.map((c) => c.rootCause).join('\n');

    const qaGraph = createAdversarialQAGraph(state.costTracker);
    const result = await qaGraph.invoke({
      content,
      findings: state.findings,
      // P1-4: Pass real evidence snapshots rather than []
      rawEvidence: state.evidenceSnapshots ?? [],
      tenantId: state.tenantId,
      auditId: state.auditId || 'unknown',
      runType: 'diagnosis',
    });

    // P0-1: Compute score HERE and thread it into state
    const qaScore = computeHallucinationScore(
      result.hallucinationFlags ?? [],
      result.consistencyFlags ?? []
    );

    const retryTriggered = qaScore > 0.3 && state.qaRetryCount < MAX_QA_RETRIES;

    // Log telemetry (fire-and-forget)
    logQATelemetry({
      graphName: 'diagnosis',
      content,
      qaResult: result,
      retryTriggered,
      retryCount: state.qaRetryCount,
      tenantId: state.tenantId,
      auditId: state.auditId,
    }).catch((e) => logger.warn({ error: e }, '[DiagnosisGraph] QA telemetry log failed'));

    if (retryTriggered) {
      logger.warn(
        { qaScore, qaRetryCount: state.qaRetryCount },
        '[DiagnosisGraph] QA hallucination score > 0.3 — triggering QA retry'
      );
    } else if (result.hallucinationFlags?.length > 0) {
      logger.warn(
        { qaScore, flags: result.hallucinationFlags.length },
        '[DiagnosisGraph] Hallucination flags present but below threshold — continuing'
      );
    }

    return {
      narrative: result.hardenedContent || state.narrative,
      // P0-1: Thread computed score into state for route_qa to read
      lastQaScore: qaScore,
      qaRetryCount: state.qaRetryCount,
    };
  } catch (error) {
    logger.error(
      { node: 'adversarial_qa', error },
      '[LangGraph] adversarial_qa failed — skipping QA rather than crashing'
    );
    // Return state unchanged — QA failure is non-fatal
    return {
      lastQaScore: 0,
      qaRetryCount: state.qaRetryCount,
      errors: [nodeError('adversarial_qa', error)],
    };
  }
}

/**
 * P0-1: route_qa now reads lastQaScore from state instead of recomputing.
 * Previous implementation called computeHallucinationScore([], []) → always 0.
 */
function route_qa(state: State): string {
  const HALLUCINATION_THRESHOLD = 0.3;
  // P0-1: Read the score that was computed inside adversarial_qa (never recompute here)
  const qaScore = state.lastQaScore ?? 0;

  if (qaScore > HALLUCINATION_THRESHOLD) {
    logger.warn(
      { qaScore, qaRetryCount: state.qaRetryCount, maxQaRetries: MAX_QA_RETRIES },
      '[route_qa] Score above threshold — routing through qa_delay retry gate'
    );
    return 'qa_delay'; // Intermediate node to sleep before retrying
  }

  return '__end__';
}

async function qa_delay(state: State): Promise<Partial<State>> {
  const retryCount = (state.qaRetryCount || 0) + 1;

  if (retryCount > MAX_QA_RETRIES) {
    logger.warn(
      { retryCount, maxQaRetries: MAX_QA_RETRIES },
      '[LangGraph:qa_delay] QA retry cap reached — ending degraded'
    );
    return {
      qaRetryCount: retryCount,
      degraded: true,
      errors: [nodeError('qa_delay', `QA retry cap reached (${MAX_QA_RETRIES})`)],
    };
  }

  const delayMs = exponentialBackoffMs(retryCount);
  logger.warn({ retryCount, delayMs }, '[LangGraph:qa_delay] QA Retry');
  await sleep(delayMs);
  return { qaRetryCount: retryCount };
}

function route_qa_delay(state: State): string {
  if ((state.qaRetryCount || 0) > MAX_QA_RETRIES) {
    return '__end__';
  }
  return 'cluster_root_causes';
}

export const diagnosisGraph = new StateGraph(DiagnosisState)
  .addNode('verify_evidence', verify_evidence)
  .addNode('cluster_root_causes', cluster_root_causes)
  .addNode('rank_by_impact', rank_by_impact)
  .addNode('classify_painkillers', classify_painkillers)
  .addNode('classify_vitamins', classify_vitamins)
  .addNode('generate_narrative', generate_narrative)
  .addNode('validate_diagnosis', validate_diagnosis)
  .addNode('prepare_retry', prepare_retry)
  .addNode('degrade_and_continue', degrade_and_continue)
  .addNode('adversarial_qa', adversarial_qa)
  .addNode('qa_delay', qa_delay)
  .addEdge('__start__', 'verify_evidence')
  .addEdge('verify_evidence', 'cluster_root_causes')
  .addEdge('cluster_root_causes', 'rank_by_impact')
  .addEdge('rank_by_impact', 'classify_painkillers')
  .addEdge('classify_painkillers', 'classify_vitamins')
  .addEdge('classify_vitamins', 'generate_narrative')
  .addEdge('generate_narrative', 'validate_diagnosis')
  .addConditionalEdges('validate_diagnosis', route_validation)
  .addConditionalEdges('prepare_retry', route_prepare_retry, {
    cluster_root_causes: 'cluster_root_causes',
    degrade_and_continue: 'degrade_and_continue',
  })
  .addEdge('degrade_and_continue', 'adversarial_qa')
  .addConditionalEdges('adversarial_qa', route_qa, {
    qa_delay: 'qa_delay',
    __end__: '__end__',
  })
  .addConditionalEdges('qa_delay', route_qa_delay, {
    cluster_root_causes: 'cluster_root_causes',
    __end__: '__end__',
  })
  .compile();

/**
 * Canonical diagnosis graph invocation with intrinsic timeout safety.
 * This guard applies regardless of call site.
 */
export async function invokeDiagnosisGraphWithTimeout(
  initialState: Partial<State>,
  timeoutMs: number = DIAGNOSIS_GRAPH_TIMEOUT_MS
): Promise<State> {
  const controller = new AbortController();

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`DIAGNOSIS_GRAPH_TIMEOUT: exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      diagnosisGraph.invoke(initialState as State, { signal: controller.signal } as any),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DIAGNOSIS_GRAPH_TIMEOUT')) {
      logger.error({ error, timeoutMs }, '[DiagnosisGraph] Timed out — returning degraded state');
      return {
        findings: initialState.findings ?? [],
        clusters: initialState.clusters ?? [],
        rankings: initialState.rankings ?? [],
        painkillers: initialState.painkillers ?? [],
        vitamins: initialState.vitamins ?? [],
        narrative: initialState.narrative ?? '',
        validation: initialState.validation ?? {
          valid: false,
          issues: ['Diagnosis graph timed out'],
          clusterCount: 0,
          findingsCovered: 0,
          totalFindings: (initialState.findings ?? []).length,
        },
        retryCount: initialState.retryCount ?? 0,
        degraded: true,
        staleFindingsCount: initialState.staleFindingsCount ?? 0,
        tenantId: initialState.tenantId ?? 'unknown',
        mode: initialState.mode ?? 'MULTI_STEP',
        aggregatedContext: initialState.aggregatedContext,
        auditId: initialState.auditId,
        qaRetryCount: initialState.qaRetryCount ?? 0,
        lastQaScore: initialState.lastQaScore ?? 0,
        evidenceSnapshots: initialState.evidenceSnapshots ?? [],
        errors: [
          ...(initialState.errors ?? []),
          nodeError('invokeDiagnosisGraphWithTimeout', error.message),
        ],
        costTracker: initialState.costTracker,
      } as State;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
