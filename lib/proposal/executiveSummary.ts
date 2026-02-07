import { VertexAI } from '@google-cloud/vertexai';
import { PainCluster } from '../diagnosis/types';
import { Finding } from '@prisma/client';
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
 * Generate executive summary using Gemini 1.5 Pro
 */
export async function generateExecutiveSummary(
    businessName: string,
    clusters: PainCluster[],
    findings: Finding[],
    tracker?: CostTracker
): Promise<string> {
    const vertexAI = getVertexAI();
    // Switched to Pro as per user request ("Proposal: track Gemini Pro call")
    // and ensuring quality for executive summary
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 512,
        },
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

    const prompt = `Write a compelling executive summary for a business audit proposal.

Business: ${businessName}
Total Findings: ${findings.length} (${painkillers} urgent issues, ${vitamins} growth opportunities)

Key Issues Identified:
${clusterSummaries.map((c, i) => `${i + 1}. [${c.severity.toUpperCase()}] ${c.rootCause}`).join('\n')}

Requirements:
- Start with the most urgent problem (painkillers first)
- Reference specific numbers from the findings
- Explain the business impact (lost revenue, missed opportunities)
- End with a forward-looking statement about the solution
- Keep it to 3-4 sentences
- Tone: Direct but empathetic, business-focused

Write the executive summary now:`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const summary = (response.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

        if (tracker && response.usageMetadata) {
            tracker.addLlmCall(
                'GEMINI_PRO',
                response.usageMetadata.promptTokenCount || 0,
                response.usageMetadata.candidatesTokenCount || 0
            );
        }

        return summary || `We identified ${painkillers} urgent issues and ${vitamins} growth opportunities affecting ${businessName}'s online presence and local visibility.`;
    } catch (error) {
        console.error('[Executive Summary] Error:', error);
        // Fallback
        return `We identified ${painkillers} urgent issues and ${vitamins} growth opportunities affecting ${businessName}'s online presence and local visibility.`;
    }
}
