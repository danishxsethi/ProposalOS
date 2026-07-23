import { Audit, Finding, EvidenceSnapshot } from '@prisma/client';
import { MultimodalContent } from '../llm/provider';
import { validateContextSize } from '../llm/token-counter';
import { MODEL_CONFIG } from '../config/models';
import { logger } from '../logger';

export interface AggregatedContext {
    text: string;
    images: MultimodalContent[];
    telemetry: {
        totalFindings: number;
        pruningLevel: 'NONE' | 'MODERATE' | 'AGGRESSIVE';
        estimatedTokens: number;
        isWithinBudget: boolean;
    };
}

/**
 * Aggregates all context from an Audit (findings + evidence) 
 * into a single structured format for Gemini 3.1 Pro single-pass analysis.
 * Implements Smart Context Pruning based on finding volume.
 */
export async function aggregateContext(
    audit: (Audit & { findings: Finding[], evidence: EvidenceSnapshot[] })
): Promise<AggregatedContext> {

    const findingCount = audit.findings.length;
    let pruningLevel: 'NONE' | 'MODERATE' | 'AGGRESSIVE' = 'NONE';

    if (findingCount >= 30) {
        pruningLevel = 'AGGRESSIVE';
    } else if (findingCount >= 10) {
        pruningLevel = 'MODERATE';
    }

    const images: MultimodalContent[] = [];
    let textContext = `Audit Context for: ${audit.businessName}\n`;
    textContext += `Industry: ${audit.businessIndustry || 'N/A'}\n`;
    textContext += `URL: ${audit.businessUrl || 'N/A'}\n\n`;

    // Process Evidence & Visuals
    textContext += `--- EVIDENCE SNAPSHOTS ---\n`;
    audit.evidence.forEach(ev => {
        // Assume visual prompts or screenshots tag their source or module appropriately
        if (ev.source.toLowerCase().includes('screenshot') || ev.module.toLowerCase().includes('vision')) {
            // Keep all screenshots regardless of pruning level
            const raw = ev.rawResponse as any;
            if (raw && Array.isArray(raw.screenshots)) {
                for (const shot of raw.screenshots) {
                    if (shot.base64) {
                        images.push({
                            type: 'image',
                            data: shot.base64,
                            mimeType: shot.mimeType || 'image/png'
                        });
                    }
                }
                textContext += `[Visual Evidence Loaded: ${ev.module} - ${ev.source}]\n`;
            }
        } else {
            // Prune text-based evidence
            if (pruningLevel === 'NONE') {
                textContext += `Evidence (${ev.module}): ${JSON.stringify(ev.rawResponse)}\n`;
            } else if (pruningLevel === 'MODERATE') {
                // Keep summarized/truncated evidence
                const stringified = JSON.stringify(ev.rawResponse);
                textContext += `Evidence (${ev.module}): ${stringified.substring(0, 500)}...\n`;
            } else {
                // Aggressive: Only note that it exists, unless it's critical
                textContext += `Evidence (${ev.module}): [Data available but truncated due to context size]\n`;
            }
        }
    });

    // Process Findings
    textContext += `\n--- RAW FINDINGS ---\n`;
    audit.findings.forEach((f, idx) => {
        textContext += `Finding ${idx + 1}: [${f.impactScore}/10] ${f.title}\n`;

        if (pruningLevel !== 'AGGRESSIVE' && f.description) {
            textContext += `Description: ${f.description}\n`;
        }

        if (pruningLevel === 'NONE') {
            textContext += `Raw Metrics: ${JSON.stringify(f.metrics)}\n`;
        }
        textContext += '\n';
    });

    // Validate Context Size (Using 3.1 Pro model)
    const modelName = process.env.GEMINI_31_PRO_ENABLED === 'true'
        ? 'gemini-1.5-pro' // Using 1.5-pro token counts as substitute locally
        : MODEL_CONFIG.diagnosis.model;

    const validationContent: MultimodalContent[] = [
        { type: 'text', data: textContext },
        ...images
    ];

    const telemetryResult = await validateContextSize(modelName, validationContent);

    logger.info({
        auditId: audit.id,
        findingCount,
        pruningLevel,
        estimatedTokens: telemetryResult.totalTokens,
        isWithinBudget: telemetryResult.isWithinBudget
    }, 'Context aggregated for Single-Pass Diagnosis');

    return {
        text: textContext,
        images,
        telemetry: {
            totalFindings: findingCount,
            pruningLevel,
            estimatedTokens: telemetryResult.totalTokens,
            isWithinBudget: telemetryResult.isWithinBudget
        }
    };
}
