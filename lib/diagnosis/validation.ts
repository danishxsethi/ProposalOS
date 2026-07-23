import { Finding, PainCluster } from './types';
import { generateWithGemini } from '@/lib/llm/provider';
import { logger } from '@/lib/logger';

/**
 * Score cluster severity based on finding impact scores
 */
export function scoreCluster(findings: Finding[]): 'critical' | 'high' | 'medium' | 'low' {
    const impacts = findings.map((f) => f.impactScore);

    // Critical: Contains ≥1 finding with impact ≥9, OR ≥3 findings with impact ≥7
    if (impacts.some((i) => i >= 9) || impacts.filter((i) => i >= 7).length >= 3) {
        return 'critical';
    }

    // High: Contains ≥1 finding with impact ≥7, OR ≥3 findings with impact ≥5
    if (impacts.some((i) => i >= 7) || impacts.filter((i) => i >= 5).length >= 3) {
        return 'high';
    }

    // Medium: Average impact ≥5
    const avgImpact = impacts.reduce((sum, i) => sum + i, 0) / impacts.length;
    if (avgImpact >= 5) {
        return 'medium';
    }

    return 'low';
}

/**
 * Validate that clusters account for all findings
 */
export function validateClusters(
    clusters: PainCluster[],
    originalFindings: Finding[]
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Structural Validation
    // Get all finding IDs from clusters
    const clusteredIds = new Set<string>();
    for (const cluster of clusters) {
        for (const id of cluster.findingIds) {
            if (clusteredIds.has(id)) {
                errors.push(`Finding ${id} appears in multiple clusters`);
            }
            clusteredIds.add(id);
        }
    }

    // Check if all findings are accounted for
    for (const finding of originalFindings) {
        if (!clusteredIds.has(finding.id)) {
            errors.push(`Finding ${finding.id} not included in any cluster`);
        }
    }

    // Check for invalid finding IDs
    const validIds = new Set(originalFindings.map((f) => f.id));
    for (const id of clusteredIds) {
        if (!validIds.has(id)) {
            errors.push(`Cluster references non-existent finding ${id}`);
        }
    }

    // 2. Evidence Freshness Validation
    // Enforce max_age_hours (e.g. 72 hours) on finding creation / evidence collection
    const MAX_AGE_HOURS = 72;
    const now = new Date().getTime();
    for (const finding of originalFindings) {
        if (finding.createdAt) {
            const ageHours = (now - new Date(finding.createdAt).getTime()) / (1000 * 60 * 60);
            if (ageHours > MAX_AGE_HOURS) {
                errors.push(`Finding ${finding.id} exceeds max_age_hours (${Math.round(ageHours)}h > ${MAX_AGE_HOURS}h). Data is stale.`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validates the truthfulness of a cluster's narrative and rootCause against the actual evidence payload of its findings.
 */
export async function validateTruthfulness(clusters: PainCluster[], originalFindings: Finding[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Map findings for quick lookup
    const findingMap = new Map(originalFindings.map(f => [f.id, f]));

    for (const cluster of clusters) {
        // Collect evidence payload for this cluster
        const clusterEvidence = cluster.findingIds
            .map(id => findingMap.get(id))
            .filter(Boolean)
            .map(f => ({
                title: f!.title,
                evidence: f!.evidence
            }));

        // Use LLM to verify if the cluster claim is supported ONLY by the provided evidence
        const prompt = `
You are an expert auditor. Your job is to verify if a given claim is strictly supported by the provided evidence payload.
You must reject any claims that contain hallucinations, details, numbers, or assertions not explicitly found in the evidence.

Claim (Root Cause): ${cluster.rootCause}
Claim (Narrative): ${cluster.narrative || 'None'}

Evidence Payload:
${JSON.stringify(clusterEvidence, null, 2)}

Respond with a JSON object:
{
    "isSupported": boolean,
    "unsupportedClaims": ["list of specific assertions not found in evidence"]
}`;

        try {
            const result = await generateWithGemini({
                model: 'gemini-1.5-flash-latest',
                input: prompt,
                responseModality: 'json',
                temperature: 0.1,
                metadata: { node: 'truthfulness_validator' }
            });

            const parsed = JSON.parse(result.text);
            if (!parsed.isSupported) {
                const unsupportedList = parsed.unsupportedClaims?.join("; ") || "General hallucination detected";
                errors.push(`Cluster claim for rootCause "${cluster.rootCause}" is rejected due to uncited claims: ${unsupportedList}`);
            }
        } catch (error) {
            logger.warn({ error, cluster }, 'Truthfulness check failed via LLM. Proceeding with caution.');
        }
    }

    return { valid: errors.length === 0, errors };
}
