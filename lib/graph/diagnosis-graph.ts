import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding, PainCluster } from '@/lib/diagnosis/types';
import { preClusterFindings } from '@/lib/diagnosis/preCluster';
import { llmClusterFindings, llmSinglePassClustering, generateNarratives } from '@/lib/diagnosis/llmCluster';
import { validateClusters } from '@/lib/diagnosis/validation';
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

export const diagnosisGraph = new StateGraph(DiagnosisState)
    .addNode("parse_findings", parse_findings)
    .addNode("cluster_root_causes", cluster_root_causes)
    .addNode("rank_by_impact", rank_by_impact)
    .addNode("classify_painkillers", classify_painkillers)
    .addNode("classify_vitamins", classify_vitamins)
    .addNode("generate_narrative", generate_narrative)
    .addNode("validate_diagnosis", validate_diagnosis)
    .addEdge("__start__", "parse_findings")
    .addEdge("parse_findings", "cluster_root_causes")
    .addEdge("cluster_root_causes", "rank_by_impact")
    .addEdge("rank_by_impact", "classify_painkillers")
    .addEdge("classify_painkillers", "classify_vitamins")
    .addEdge("classify_vitamins", "generate_narrative")
    .addEdge("generate_narrative", "validate_diagnosis")
    .addEdge("validate_diagnosis", "__end__")
    .compile();
