import { PainCluster } from '../diagnosis/types';
import { Finding } from '@prisma/client';
import { CostTracker } from '@/lib/costs/costTracker';
import { traceLlmCall } from '@/lib/tracing';
import { RunTree } from 'langsmith';
import { getPromptVariant, fillTemplate } from '../experiments/promptAB';
import { getGeminiModel } from '@/lib/llm/gemini';

/**
 * Generate executive summary using Gemini 1.5 Pro
 */
export async function generateExecutiveSummary(
    businessName: string,
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker,
    parentTrace?: RunTree
): Promise<string> {
    const model = getGeminiModel('gemini-2.5-flash', {
        temperature: 0.4,
        maxOutputTokens: 512,
    });

    // Prepare cluster summaries
    const clusterSummaries = clusters.map((c) => ({
        rootCause: c.rootCause,
        severity: c.severity,
        narrative: c.narrative,
        findingCount: c.findingIds.length,
    }));

    // Count painkillers vs vitamins
    const painkillers = findings.filter((f) => f.type === 'PAINKILLER').length;
    const vitamins = findings.filter((f) => f.type === 'VITAMIN').length;

    // Get Audit ID for deterministic A/B testing
    const auditId = findings[0]?.auditId || 'unknown_audit';

    // Get prompt variant
    const promptConfig = getPromptVariant('exec-summary', auditId);

    const clusterSummariesText = clusterSummaries.map((c, i) => `${i + 1}. [${c.severity.toUpperCase()}] ${c.rootCause}`).join('\n');

    const prompt = fillTemplate(promptConfig.template, {
        business_name: businessName,
        total_findings: findings.length,
        painkillers_count: painkillers,
        vitamins_count: vitamins,
        cluster_summaries: clusterSummariesText
    });

    return traceLlmCall({
        name: "exec_summary",
        run_type: "llm",
        inputs: { businessName, findingsCount: findings.length, topIssues: clusterSummaries.slice(0, 3), prompt_variant: promptConfig.variant },
        parent: parentTrace,
        tags: ["exec_summary", "gemini-pro", `exp:${promptConfig.name}`, `variant:${promptConfig.variant}`],
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
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (tracker && response.usageMetadata) {
                tracker.addLlmCall('GEMINI_PRO',
                    response.usageMetadata.promptTokenCount || 0,
                    response.usageMetadata.candidatesTokenCount || 0
                );
            }

            return text || "Executive summary generation failed.";
        } catch (error) {
            console.error("Error generating executive summary:", error);
            throw error;
        }
    }); // Ended traceLlmCall
}
