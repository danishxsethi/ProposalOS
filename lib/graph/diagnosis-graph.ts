/**
 * NOTE (Pipeline 18 — Temporal Cloud Decision):
 * Native LangGraph orchestration is used instead of Temporal Cloud.
 * LangGraph provides built-in state persistence, retry logic, and conditional
 * routing which satisfies all orchestration requirements for this system.
 * Temporal migration is deferred to post-launch if scale demands distributed
 * workflow durability beyond what LangGraph's checkpointing provides.
 */
import { StateGraph, Annotation } from "@langchain/langgraph";

import { Finding, PainCluster } from '@/lib/diagnosis/types';
import { preClusterFindings } from '@/lib/diagnosis/preCluster';
import { llmClusterFindings, llmSinglePassClustering, generateNarratives } from '@/lib/diagnosis/llmCluster';
import { validateClusters } from '@/lib/diagnosis/validation';
import { AggregatedContext } from '@/lib/context/aggregator';
import { adversarialQAGraph } from '@/lib/graph/adversarial-qa-graph';
import { verifyEvidenceActivity } from '@/lib/graph/activities/verifyEvidence';
import { logQATelemetry, computeHallucinationScore } from '@/lib/qa/telemetry';

export const DiagnosisState = Annotation.Root({
    findings: Annotation<Finding[]>({
        reducer: (x, y) => y,
        default: () => []
    }),
    clusters: Annotation<PainCluster[]>({
        reducer: (x, y) => y,
        default: () => []
    }),
    rankings: Annotation<any[]>({
        reducer: (x, y) => y,
        default: () => []
    }),
    painkillers: Annotation<any[]>({
        reducer: (x, y) => y,
        default: () => []
    }),
    vitamins: Annotation<any[]>({
        reducer: (x, y) => y,
        default: () => []
    }),
    narrative: Annotation<string>({
        reducer: (x, y) => y,
        default: () => ""
    }),
    validation: Annotation<any>({
        reducer: (x, y) => y,
        default: () => ({ valid: true, errors: [] })
    }),
    retryCount: Annotation<number>({
        reducer: (x, y) => y,
        default: () => 0
    }),
    degraded: Annotation<boolean>({
        reducer: (x, y) => y,
        default: () => false
    }),
    staleFindingsCount: Annotation<number>({
        reducer: (x, y) => y,
        default: () => 0
    }),
    tenantId: Annotation<string>({ reducer: (x, y) => y }),
    // Extended single-pass mode flags
    mode: Annotation<'SINGLE_PASS' | 'MULTI_STEP'>({
        reducer: (x, y) => y,
        default: () => 'MULTI_STEP'
    }),
    aggregatedContext: Annotation<AggregatedContext | undefined>({
        reducer: (x, y) => y,
        default: () => undefined
    }),
    auditId: Annotation<string | undefined>({ reducer: (x, y) => y }),
    // QA retry tracking
    qaRetryCount: Annotation<number>({
        reducer: (x, y) => y,
        default: () => 0
    }),
});

// Nodes
async function parse_findings(state: typeof DiagnosisState.State) {
    return { findings: state.findings };
}

async function verify_evidence(state: typeof DiagnosisState.State) {
    const { findings, staleCount } = await verifyEvidenceActivity(state.findings);
    return { findings, staleFindingsCount: staleCount };
}

async function cluster_root_causes(state: typeof DiagnosisState.State) {
    let clusters;

    if (state.mode === 'SINGLE_PASS' && state.aggregatedContext) {
        // Execute extreme context analysis avoiding intermediate abstractions
        clusters = await llmSinglePassClustering(state.aggregatedContext, state.findings);
    } else {
        // Legacy Map-Reduce behavior
        const preClusters = preClusterFindings(state.findings);
        clusters = await llmClusterFindings(preClusters, state.findings, undefined, undefined, undefined);
    }

    return { clusters };
}

async function rank_by_impact(state: typeof DiagnosisState.State) {
    return { rankings: state.clusters };
}

async function classify_painkillers(state: typeof DiagnosisState.State) {
    return { painkillers: state.clusters.filter(c => c.severity === 'high') };
}

async function classify_vitamins(state: typeof DiagnosisState.State) {
    return { vitamins: state.clusters.filter(c => c.severity !== 'high') };
}

async function generate_narrative(state: typeof DiagnosisState.State) {
    const clusters = await generateNarratives(state.clusters, state.findings, undefined, undefined, undefined);
    return { clusters };
}

async function validate_diagnosis(state: typeof DiagnosisState.State) {
    const validation = validateClusters(state.clusters, state.findings);
    return { validation };
}

function route_validation(state: typeof DiagnosisState.State) {
    if (state.validation.valid) {
        return "adversarial_qa";
    }
    if (state.retryCount >= 2) {
        return "degrade_and_continue";
    }
    return "prepare_retry";
}

async function prepare_retry(state: typeof DiagnosisState.State) {
    return { retryCount: state.retryCount + 1 };
}

async function degrade_and_continue(state: typeof DiagnosisState.State) {
    console.warn(`[DiagnosisGraph] Validation failed after 2 retries. Proceeding in degraded mode.`);
    return { degraded: true };
}

async function adversarial_qa(state: typeof DiagnosisState.State) {
    const content = state.clusters.map(c => c.rootCause).join('\n');
    const result = await adversarialQAGraph.invoke({
        content,
        findings: state.findings,
        rawEvidence: [],
        tenantId: state.tenantId,
        auditId: state.auditId || 'unknown',
        runType: 'diagnosis'
    });

    const qaScore = computeHallucinationScore(
        result.hallucinationFlags,
        result.consistencyFlags
    );

    const retryTriggered = qaScore > 0.3 && state.qaRetryCount < 1;

    // Log telemetry (fire-and-forget)
    await logQATelemetry({
        graphName: 'diagnosis',
        content,
        qaResult: result,
        retryTriggered,
        retryCount: state.qaRetryCount,
        tenantId: state.tenantId,
        auditId: state.auditId,
    });

    if (retryTriggered) {
        console.warn(`[DiagnosisGraph] QA hallucination score ${qaScore.toFixed(2)} > 0.3 — triggering QA retry (attempt ${state.qaRetryCount + 1})`);
    } else if (result.hallucinationFlags.length > 0) {
        console.warn(`[DiagnosisGraph] Hallucination detected: ${result.hallucinationFlags.length} flags (score ${qaScore.toFixed(2)}) — passed threshold, continuing`);
    }

    return {
        narrative: result.hardenedContent || state.narrative,
        qaRetryCount: retryTriggered ? state.qaRetryCount + 1 : state.qaRetryCount,
    };
}

/** Routes after QA: retry diagnosis if score > 0.3 and within retry budget, else end. */
function route_qa(state: typeof DiagnosisState.State): string {
    const content = state.clusters.map(c => c.rootCause).join('\n');
    // We use qaRetryCount > 0 as the proxy that a retry was just triggered
    // (incremented inside adversarial_qa before we reach this router)
    const lastQaScore = computeHallucinationScore(
        [], // can't re-compute here; rely on state.qaRetryCount as proxy
        []
    );
    // Retry loop: qaRetryCount was incremented inside adversarial_qa if retryTriggered
    // We retry if count is 1 (meaning we just bumped it from 0 → 1)
    if (state.qaRetryCount === 1) {
        return 'cluster_root_causes'; // Re-diagnose from clustering
    }
    return '__end__';
}

export const diagnosisGraph = new StateGraph(DiagnosisState)
    .addNode("parse_findings", parse_findings)
    .addNode("verify_evidence", verify_evidence)
    .addNode("cluster_root_causes", cluster_root_causes)
    .addNode("rank_by_impact", rank_by_impact)
    .addNode("classify_painkillers", classify_painkillers)
    .addNode("classify_vitamins", classify_vitamins)
    .addNode("generate_narrative", generate_narrative)
    .addNode("validate_diagnosis", validate_diagnosis)
    .addNode("prepare_retry", prepare_retry)
    .addNode("degrade_and_continue", degrade_and_continue)
    .addNode("adversarial_qa", adversarial_qa)
    .addEdge("__start__", "parse_findings")
    .addEdge("parse_findings", "verify_evidence")
    .addEdge("verify_evidence", "cluster_root_causes")
    .addEdge("cluster_root_causes", "rank_by_impact")
    .addEdge("rank_by_impact", "classify_painkillers")
    .addEdge("classify_painkillers", "classify_vitamins")
    .addEdge("classify_vitamins", "generate_narrative")
    .addEdge("generate_narrative", "validate_diagnosis")
    .addConditionalEdges("validate_diagnosis", route_validation)
    .addEdge("prepare_retry", "cluster_root_causes")
    .addEdge("degrade_and_continue", "adversarial_qa")
    .addConditionalEdges("adversarial_qa", route_qa, {
        cluster_root_causes: "cluster_root_causes",
        __end__: "__end__"
    })
    .compile();
