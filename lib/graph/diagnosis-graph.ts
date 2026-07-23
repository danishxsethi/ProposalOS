import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding, PainCluster } from '@/lib/diagnosis/types';
import { preClusterFindings } from '@/lib/diagnosis/preCluster';
import { llmClusterFindings, llmSinglePassClustering, generateNarratives } from '@/lib/diagnosis/llmCluster';
import { validateClusters, validateTruthfulness } from '@/lib/diagnosis/validation';
import { AggregatedContext } from '@/lib/context/aggregator';

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
});

// Nodes
async function deduplicate_findings(state: typeof DiagnosisState.State) {
    // Semantic Deduplication
    const unique = new Map<string, Finding>();

    for (const f of state.findings) {
        const titleKey = f.title.toLowerCase().trim();
        if (!unique.has(titleKey) || f.confidenceScore > unique.get(titleKey)!.confidenceScore) {
            unique.set(titleKey, f);
        }
    }

    // FIX-14: Filter out weak findings (low impact AND low confidence)
    const deduped = Array.from(unique.values());
    const filtered = deduped.filter(f => !(f.impactScore < 3 && f.confidenceScore < 3));
    const removedCount = deduped.length - filtered.length;
    if (removedCount > 0) {
        console.info(`[DiagnosisGraph] Filtered out ${removedCount} weak findings (impact<3 AND confidence<3)`);
    }

    return { findings: filtered };
}

async function parse_findings(state: typeof DiagnosisState.State) {
    return { findings: state.findings };
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

    // FIX-15: Remap severity → 3-tier paradigm (TOURNIQUET / PAINKILLER / VITAMIN)
    clusters = clusters.map((c: any) => ({
        ...c,
        tier: c.severity === 'critical'
            ? 'TOURNIQUET'
            : c.severity === 'high'
                ? 'PAINKILLER'
                : 'VITAMIN',
    }));

    return { clusters, retryCount: state.retryCount + 1 };
}

async function rank_by_impact(state: typeof DiagnosisState.State) {
    return { rankings: state.clusters };
}

// FIX-15: Use 3-tier labels
async function classify_painkillers(state: typeof DiagnosisState.State) {
    return {
        painkillers: state.clusters.filter(
            (c: any) => c.tier === 'TOURNIQUET' || c.tier === 'PAINKILLER'
        ),
    };
}

// FIX-15: VITAMINS are the lowest-priority tier
async function classify_vitamins(state: typeof DiagnosisState.State) {
    return {
        vitamins: state.clusters.filter((c: any) => c.tier === 'VITAMIN'),
    };
}


async function generate_narrative(state: typeof DiagnosisState.State) {
    const clusters = await generateNarratives(state.clusters, state.findings, undefined, undefined, undefined);
    return { clusters };
}

async function validate_diagnosis(state: typeof DiagnosisState.State) {
    const validation = validateClusters(state.clusters, state.findings);

    // Also run truthfulness validation
    const truthfulness = await validateTruthfulness(state.clusters, state.findings);
    if (!truthfulness.valid) {
        validation.valid = false;
        validation.errors.push(...truthfulness.errors);
    }

    return { validation };
}

function should_retry_clustering(state: typeof DiagnosisState.State) {
    // Retry up to 3 times if validation fails (Graph Reliability - 3B)
    if (!state.validation.valid && state.retryCount < 3) {
        console.warn(`[DiagnosisGraph] Validation Failed. Initiating Retry ${state.retryCount}/3`);
        return "retry";
    }
    return "finish";
}

export const diagnosisGraph = new StateGraph(DiagnosisState)
    .addNode("parse_findings", parse_findings)
    .addNode("deduplicate_findings", deduplicate_findings)
    .addNode("cluster_root_causes", cluster_root_causes)
    .addNode("rank_by_impact", rank_by_impact)
    .addNode("classify_painkillers", classify_painkillers)
    .addNode("classify_vitamins", classify_vitamins)
    .addNode("generate_narrative", generate_narrative)
    .addNode("validate_diagnosis", validate_diagnosis)
    .addEdge("__start__", "parse_findings")
    .addEdge("parse_findings", "deduplicate_findings")
    .addEdge("deduplicate_findings", "cluster_root_causes")
    .addEdge("cluster_root_causes", "rank_by_impact")
    .addEdge("rank_by_impact", "classify_painkillers")
    .addEdge("classify_painkillers", "classify_vitamins")
    .addEdge("classify_vitamins", "generate_narrative")
    .addEdge("generate_narrative", "validate_diagnosis")
    .addConditionalEdges("validate_diagnosis", should_retry_clustering, {
        retry: "cluster_root_causes",
        finish: "__end__"
    })
    .compile();
