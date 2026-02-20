import { Finding, AuditModuleResult } from './types';
import { generateWithGemini } from '@/lib/llm/provider';
import { MODEL_CONFIG } from '@/lib/config/models';
import { getThinkingBudgetForNode } from '@/lib/config/thinking-budgets';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { ScreenshotResult } from '@/lib/evidence/screenshotCapture';

interface VisionModuleInput {
    auditId: string;
    businessName: string;
    industry: string;
    screenshots: ScreenshotResult[];
}

export async function runVisionModule(
    input: VisionModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ auditId: input.auditId, numScreenshots: input.screenshots.length }, '[VisionModule] Executing Prompt 20 Vision Analysis');

    const findings: Finding[] = [];
    const imagesToAnalyze = input.screenshots.filter(s => s.base64);

    if (imagesToAnalyze.length === 0) {
        logger.warn({ auditId: input.auditId }, '[VisionModule] No valid base64 screenshots to analyze');
        return { findings: [], evidenceSnapshots: [] };
    }

    const systemPrompt = `You are a world-class conversion rate optimization (CRO) and UX designer.
You are reviewing visual evidence (screenshots) of a business's online presence.

Analyze the provided screenshots and identify exactly 1-3 critical visual pain points. Focus strictly on:
1. Above-the-fold layout issues (e.g. missing call-to-actions, poor contrast, cluttered hero sections)
2. Mobile tap targets and responsiveness
3. Visual hierarchy and trust signals

If the issues are severe enough to hurt conversions, classify the finding impact score between 7 and 10. If they are minor, between 4 and 6.
Return ONLY a valid JSON object matching this exact schema:

{
  "findings": [
    {
      "type": "VISUAL_UX",  // Must be one of: VISUAL_UX, VISUAL_DESIGN, VISUAL_COMPARISON
      "title": "Clear 5-7 word title of the visual issue",
      "description": "2-3 sentence explanation of why this visual issue hurts trust or conversions.",
      "impactScore": 8,
      "recommendedFix": ["Actionable step 1", "Actionable step 2"]
    }
  ]
}

DO NOT wrap the response in markdown codeblocks. Just raw JSON. Keep it professional and persuasive.`;

    try {
        const result = await generateWithGemini({
            model: MODEL_CONFIG.diagnosis.model,
            input: [
                { type: 'text', data: systemPrompt },
                ...imagesToAnalyze.map(img => ({
                    type: 'image' as const,
                    data: img.base64!,
                    mimeType: img.mimeType || 'image/png'
                }))
            ],
            thinkingBudget: getThinkingBudgetForNode('vision_analysis') || 4096,
            temperature: 0.1,
            maxOutputTokens: 1024,
            metadata: { node: 'vision_analysis', auditId: input.auditId }
        });

        if (tracker && result.usageMetadata) {
            tracker.addLlmCall(
                'GEMINI_31_PRO',
                result.usageMetadata.promptTokenCount || 0,
                result.usageMetadata.candidatesTokenCount || 0,
                result.usageMetadata.thoughtsTokenCount || 0
            );
        }

        let text = result.text.trim();
        if (text.startsWith('```json')) text = text.replace(/```json\n?/, '').replace(/\n?```$/, '');
        else if (text.startsWith('```')) text = text.replace(/```\n?/, '').replace(/\n?```$/, '');

        const parsed = JSON.parse(text);
        if (parsed.findings && Array.isArray(parsed.findings)) {
            parsed.findings.forEach((f: any) => {
                // Determine appropriate category
                const category = f.type === 'VISUAL_UX' ? 'conversion' : 'trust';

                findings.push({
                    module: 'vision',
                    category,
                    type: f.impactScore >= 7 ? 'PAINKILLER' : 'VITAMIN',
                    title: f.title,
                    description: f.description,
                    evidence: imagesToAnalyze.slice(0, 2).map((img, i) => ({
                        type: 'image',
                        value: img.url,
                        thumbnailUrl: img.thumbnailUrl,
                        label: `Visual Proof: ${img.name}`
                    })),
                    metrics: { specificFindingType: f.type },
                    impactScore: f.impactScore,
                    confidenceScore: 90,
                    effortEstimate: 'MEDIUM',
                    recommendedFix: f.recommendedFix
                });
            });
        }

        logger.info({ auditId: input.auditId, findingsGenerated: findings.length }, '[VisionModule] Complete');

        return {
            findings,
            evidenceSnapshots: [
                {
                    module: 'vision',
                    source: 'gemini_31_pro',
                    rawResponse: parsed,
                    collectedAt: new Date()
                }
            ]
        };
    } catch (e) {
        logger.error({ error: e, auditId: input.auditId }, '[VisionModule] Failed to analyze vision inputs');
        return { findings: [], evidenceSnapshots: [] };
    }
}
