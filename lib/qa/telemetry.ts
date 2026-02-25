/**
 * lib/qa/telemetry.ts
 *
 * Task 3: Structured telemetry logging for all Adversarial QA runs.
 *
 * Called by adversarial_qa nodes in both diagnosis-graph.ts and proposal-graph.ts.
 * Stores results in QATelemetry table for monitoring via /api/admin/qa-telemetry.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { HallucinationFlag, ConsistencyFlag } from '@/lib/graph/adversarial-qa-graph';

export interface QARunResult {
    hallucinationFlags: HallucinationFlag[];
    consistencyFlags: ConsistencyFlag[];
    competitorFlags: any[];
    hardenedContent: string;
}

export interface QATelemetryInput {
    graphName: 'diagnosis' | 'proposal';
    content: string;
    qaResult: QARunResult;
    retryTriggered: boolean;
    retryCount: number;
    tenantId?: string;
    auditId?: string;
    proposalId?: string;
}

/**
 * Compute a hallucination score: (hallucinationCount / max(1, totalIssues)).
 * Returns a float 0.0–1.0.
 */
export function computeHallucinationScore(
    hallucinationFlags: HallucinationFlag[],
    consistencyFlags: ConsistencyFlag[]
): number {
    const hCount = hallucinationFlags.length;
    const cCount = consistencyFlags.length;
    const totalIssues = hCount + cCount;
    if (totalIssues === 0) return 0;
    // Weight hallucinations more heavily (70%) vs consistency flags (30%)
    return Math.min(1.0, (hCount * 0.7 + cCount * 0.3) / Math.max(5, totalIssues));
}

/**
 * Persist a QA telemetry record to the database.
 * Fire-and-forget safe — errors are caught and logged but never bubble up to the caller.
 */
export async function logQATelemetry(input: QATelemetryInput): Promise<void> {
    try {
        const inputHash = crypto
            .createHash('sha256')
            .update(input.content.slice(0, 2000))
            .digest('hex')
            .slice(0, 16);

        const qaScore = computeHallucinationScore(
            input.qaResult.hallucinationFlags,
            input.qaResult.consistencyFlags
        );

        await (prisma as any).qATelemetry.create({
            data: {
                graphName: input.graphName,
                inputHash,
                qaScore,
                hallucinationCount: input.qaResult.hallucinationFlags.length,
                unsupportedCount: input.qaResult.consistencyFlags.length,
                consistencyCount: input.qaResult.consistencyFlags.length,
                hallucinations: input.qaResult.hallucinationFlags as any,
                unsupportedClaims: input.qaResult.consistencyFlags as any,
                retryTriggered: input.retryTriggered,
                retryCount: input.retryCount,
                tenantId: input.tenantId ?? null,
                auditId: input.auditId ?? null,
                proposalId: input.proposalId ?? null,
            },
        });
    } catch (err) {
        console.error('[QATelemetry] Failed to write telemetry record:', err);
    }
}
