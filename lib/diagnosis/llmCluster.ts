import { VertexAI } from '@google-cloud/vertexai';
import { Finding, PreCluster, PainCluster } from './types';
import { scoreCluster } from './validation';
import { CostTracker } from '@/lib/costs/costTracker';

/**
 * Initialize Vertex AI client
 */
function getVertexAI() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_REGION || 'us-central1';

    if (!projectId) {
        throw new Error('GCP_PROJECT_ID not found in environment variables');
    }

    return new VertexAI({ project: projectId, location });
}

/**
 * Use Gemini 1.5 Flash to refine pre-clusters into semantic pain clusters
 */
export async function llmClusterFindings(
    preClusters: PreCluster[],
    allFindings: Finding[],
    tracker?: CostTracker
): Promise<PainCluster[]> {
    const vertexAI = getVertexAI();
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
            temperature: 0, // Deterministic for consistency
            maxOutputTokens: 2048,
        },
    });

    // Prepare findings for LLM
    const findingsJson = allFindings.map((f) => ({
        id: f.id,
        title: f.title,
        module: f.module,
        category: f.category,
        impactScore: f.impactScore,
    }));

    const preClustersJson = preClusters.map((pc) => ({
        key: pc.key,
        findingIds: pc.findings.map((f) => f.id),
    }));

    const prompt = `You are analyzing audit findings for a local business. 
Group these findings into root-cause clusters. 
Each cluster should represent ONE underlying problem.

For each cluster, provide:
- root_cause: 1-sentence description of the underlying problem
- finding_ids: array of finding IDs in this cluster

Rules:
- Every finding must appear in exactly one cluster
- Do NOT invent new findings or data
- Reference finding IDs, not descriptions
- Merge related issues into single clusters
- Keep clusters semantically meaningful

Findings: ${JSON.stringify(findingsJson, null, 2)}

Pre-clusters: ${JSON.stringify(preClustersJson, null, 2)}

Return valid JSON only: { "clusters": [ { "root_cause": "...", "finding_ids": ["id1", "id2"] } ] }`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Track usage
        if (tracker && response.usageMetadata) {
            tracker.addLlmCall(
                'GEMINI_FLASH',
                response.usageMetadata.promptTokenCount || 0,
                response.usageMetadata.candidatesTokenCount || 0
            );
        }

        // Extract JSON from response (handle markdown code blocks if present)
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(jsonText);
        const rawClusters = parsed.clusters || [];

        // Convert to PainCluster format and score
        const painClusters: PainCluster[] = rawClusters.map((rc: any, idx: number) => {
            const findingsInCluster = allFindings.filter((f) => rc.finding_ids.includes(f.id));
            const severity = scoreCluster(findingsInCluster);

            return {
                id: `cluster-${idx + 1}`,
                rootCause: rc.root_cause,
                severity,
                findingIds: rc.finding_ids,
            };
        });

        return painClusters;
    } catch (error) {
        console.error('[LLM Clustering] Error:', error);
        // Fallback: use pre-clusters as-is
        return preClusters.map((pc, idx) => ({
            id: `cluster-${idx + 1}`,
            rootCause: `Issues with ${pc.key}`,
            severity: scoreCluster(pc.findings),
            findingIds: pc.findings.map((f) => f.id),
        }));
    }
}

/**
 * Use Gemini 1.5 Pro to generate human-readable narratives for clusters
 */
export async function generateNarratives(
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker
): Promise<PainCluster[]> {
    const vertexAI = getVertexAI();
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
            temperature: 0.3, // Slight creativity for better readability
            maxOutputTokens: 512,
        },
    });

    const narrativeClusters: PainCluster[] = [];

    for (const cluster of clusters) {
        const clusterFindings = findings.filter((f) => cluster.findingIds.includes(f.id));

        const findingsDetail = clusterFindings.map((f) => ({
            title: f.title,
            impactScore: f.impactScore,
            confidenceScore: f.confidenceScore,
            metrics: f.metrics,
        }));

        const prompt = `Write a clear, empathetic explanation of this problem for a 
local business owner. Use plain English, no jargon.

Rules:
- Reference specific metrics from the findings (e.g., "your page speed score is 34/100")
- Explain WHY this matters to their business
- Do NOT make claims that aren't in the findings
- Keep it to 2-3 sentences
- Tone: concerned but helpful, not alarming

Cluster: ${cluster.rootCause}
Findings: ${JSON.stringify(findingsDetail, null, 2)}

Write a narrative explanation (2-3 sentences only):`;

        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const narrative = (response.candidates?.[0]?.content?.parts?.[0]?.text || cluster.rootCause).trim();

            if (tracker && response.usageMetadata) {
                tracker.addLlmCall(
                    'GEMINI_PRO', // Narratives use Pro
                    response.usageMetadata.promptTokenCount || 0,
                    response.usageMetadata.candidatesTokenCount || 0
                );
            }

            narrativeClusters.push({
                ...cluster,
                narrative,
            });
        } catch (error) {
            console.error(`[Narrative Generation] Error for cluster ${cluster.id}:`, error);
            // Fallback: use root cause as narrative
            narrativeClusters.push({
                ...cluster,
                narrative: cluster.rootCause,
            });
        }
    }

    return narrativeClusters;
}
