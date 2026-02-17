import { Finding, PreCluster, PainCluster } from './types';
import { scoreCluster } from './validation';
import { CostTracker } from '@/lib/costs/costTracker';
import { traceLlmCall } from '@/lib/tracing';
import { RunTree } from 'langsmith';
import { getGeminiModel } from '@/lib/llm/gemini';
// Import A/B testing system
import { getPromptVariant, fillTemplate } from '../experiments/promptAB';

/**
 * Use Gemini 1.5 Flash to refine pre-clusters into semantic pain clusters
 * @param playbook Optional vertical playbook — priorityFindings influence clustering context
 */
export async function llmClusterFindings(
    preClusters: PreCluster[],
    allFindings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree,
    playbook?: { priorityFindings?: string[]; proposalLanguage?: { urgencyHook?: string } }
): Promise<PainCluster[]> {
    // Using Gemini 2.0 Flash (upgraded from spec's 1.5 Flash for better JSON output)
    const model = getGeminiModel(process.env.CLUSTERING_MODEL || 'gemini-2.5-flash', {
        temperature: 0,
        maxOutputTokens: 2048,
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

    // Get Audit ID for deterministic A/B testing
    const auditId = allFindings[0]?.auditId || 'unknown_audit';

    // Get prompt variant
    const promptConfig = getPromptVariant('clustering-strategy', auditId);

    const templateVars: Record<string, string> = {
        findings_json: JSON.stringify(findingsJson, null, 2),
        preclusters_json: JSON.stringify(preClustersJson, null, 2),
        industry_context: playbook?.proposalLanguage?.urgencyHook
            ? `Industry context: ${playbook.proposalLanguage.urgencyHook}\n`
            : '',
    };
    const prompt = fillTemplate(promptConfig.template, templateVars);

    return traceLlmCall({
        name: "clustering",
        run_type: "chain",
        inputs: { findings: findingsJson, preClusters: preClustersJson, prompt_variant: promptConfig.variant },
        parent: parentTrace,
        tags: ["clustering", "gemini-flash", `exp:${promptConfig.name}`, `variant:${promptConfig.variant}`],
        metadata: {
            experiment: {
                name: promptConfig.name,
                variant: promptConfig.variant
            }
        }
    }, async () => {
        try {
            const result = await model.generateContent(prompt);
            const response = result.response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Extract JSON from response (handle markdown code blocks if present)
            let jsonText = text.trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
            }

            // Harden JSON parsing — Gemini sometimes returns malformed JSON (trailing commas, truncation)
            let parsed: { clusters?: Array<{ root_cause?: string; finding_ids?: string[] }> };
            try {
                parsed = JSON.parse(jsonText);
            } catch (parseErr) {
                // Attempt to fix trailing commas (common LLM output issue)
                const fixed = jsonText.replace(/,(\s*[}\]])/g, '$1');
                try {
                    parsed = JSON.parse(fixed);
                } catch {
                    throw parseErr; // rethrow to trigger fallback
                }
            }
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
    }, (result) => {
        // Simple token usage logging not implemented for Flash in this wrapper yet
        return { prompt: 0, completion: 0, model: "gemini-2.0-flash" };
    });
}

/**
 * Use Gemini 1.5 Pro to generate human-readable narratives for clusters
 * @param playbook Optional vertical playbook — proposalLanguage influences narrative tone
 */
export async function generateNarratives(
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree,
    playbook?: { proposalLanguage?: { painPoints?: string[]; urgencyHook?: string } }
): Promise<PainCluster[]> {
    const model = getGeminiModel('gemini-2.5-flash', {
        temperature: 0.3,
        maxOutputTokens: 512,
    });

    // Get Audit ID for deterministic A/B testing
    const auditId = findings[0]?.auditId || 'unknown_audit';

    // Get prompt variant - this applies to all narratives in this run
    const promptConfig = getPromptVariant('narrative-tone', auditId);

    const narrativeClusters: PainCluster[] = [];

    for (const cluster of clusters) {
        const clusterFindings = findings.filter((f) => cluster.findingIds.includes(f.id));

        const findingsDetail = clusterFindings.map((f) => ({
            title: f.title,
            description: f.description,
            impactScore: f.impactScore,
            confidenceScore: f.confidenceScore,
            metrics: f.metrics,
            recommendedFix: (f as any).recommendedFix,
        }));

        const templateVars: Record<string, string> = {
            root_cause: cluster.rootCause,
            findings_detail: JSON.stringify(findingsDetail, null, 2),
            industry_context: playbook?.proposalLanguage?.urgencyHook
                ? `Industry context: ${playbook.proposalLanguage.urgencyHook}\n`
                : '',
        };
        const prompt = fillTemplate(promptConfig.template, templateVars);

        await traceLlmCall({
            name: "narrative_gen",
            run_type: "llm",
            inputs: { cluster: cluster.rootCause, findings: findingsDetail, prompt_variant: promptConfig.variant },
            parent: parentTrace,
            tags: ["narrative", "gemini-pro", `exp:${promptConfig.name}`, `variant:${promptConfig.variant}`],
            metadata: {
                experiment: {
                    name: promptConfig.name,
                    variant: promptConfig.variant
                }
            }
        }, async () => {
            try {
                const result = await model.generateContent(prompt);
                const response = result.response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
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
                return narrative;
            } catch (error) {
                console.error(`[Narrative Generation] Error for cluster ${cluster.id}:`, error);
                // Fallback
                narrativeClusters.push({
                    ...cluster,
                    narrative: cluster.rootCause,
                });
                return cluster.rootCause;
            }
        });
    }

    return narrativeClusters;
}
