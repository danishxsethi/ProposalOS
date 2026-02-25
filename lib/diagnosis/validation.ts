import { Finding } from '@prisma/client';
import { PainCluster } from './types';

/**
 * Retry configuration for validation
 */
const VALIDATION_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
} as const;

/**
 * Evidence freshness configuration
 */
const FRESHNESS_CONFIG = {
    maxAgeHours: 24, // Evidence older than 24 hours is considered stale
} as const;

/**
 * Evidence verification result
 */
export interface EvidenceVerification {
    isFresh: boolean;
    ageHours: number;
    collectedAt: string;
    source: string;
    status: 'fresh' | 'stale' | 'unknown';
}

/**
 * Score cluster severity based on finding impact scores
 */
export function scoreCluster(findings: (Finding & { stale?: boolean })[]): 'critical' | 'high' | 'medium' | 'low' {
    const impacts = findings.map((f) => {
        let impact = f.impactScore;
        if (f.stale) {
            impact = Math.max(1, impact - 2); // Deprioritize stale findings
        }
        return impact;
    });

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
 * Calculate age of evidence in hours
 */
export function calculateEvidenceAgeHours(collectedAt: Date | string): number {
    const collected = typeof collectedAt === 'string' ? new Date(collectedAt) : collectedAt;
    const now = new Date();
    const diffMs = now.getTime() - collected.getTime();
    return diffMs / (1000 * 60 * 60);
}

/**
 * Verify evidence freshness based on collectedAt timestamp
 */
export function verifyEvidenceFreshness(
    collectedAt: Date | string | undefined,
    source: string = 'unknown'
): EvidenceVerification {
    if (!collectedAt) {
        return {
            isFresh: false,
            ageHours: Infinity,
            collectedAt: 'unknown',
            source,
            status: 'unknown',
        };
    }

    const ageHours = calculateEvidenceAgeHours(collectedAt);
    const isFresh = ageHours <= FRESHNESS_CONFIG.maxAgeHours;

    return {
        isFresh,
        ageHours,
        collectedAt: collectedAt instanceof Date ? collectedAt.toISOString() : collectedAt,
        source,
        status: isFresh ? 'fresh' : 'stale',
    };
}

/**
 * Verify multiple evidence items and return stale evidence warnings
 */
export function verifyEvidenceBatch(
    evidenceList: Array<{ collectedAt?: Date | string; source?: string }>
): {
    fresh: EvidenceVerification[];
    stale: EvidenceVerification[];
    unknown: EvidenceVerification[];
    hasStaleEvidence: boolean;
} {
    const fresh: EvidenceVerification[] = [];
    const stale: EvidenceVerification[] = [];
    const unknown: EvidenceVerification[] = [];

    for (const evidence of evidenceList) {
        const verification = verifyEvidenceFreshness(evidence.collectedAt, evidence.source || 'unknown');

        switch (verification.status) {
            case 'fresh':
                fresh.push(verification);
                break;
            case 'stale':
                stale.push(verification);
                break;
            case 'unknown':
                unknown.push(verification);
                break;
        }
    }

    return {
        fresh,
        stale,
        unknown,
        hasStaleEvidence: stale.length > 0,
    };
}

/**
 * Execute validation with retry logic
 */
async function validateClustersWithRetry(
    clusters: PainCluster[],
    originalFindings: Finding[]
): Promise<{ valid: boolean; errors: string[]; attempts: number }> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= VALIDATION_RETRY_CONFIG.maxRetries; attempt++) {
        try {
            const result = validateClusters(clusters, originalFindings);
            return { ...result, attempts: attempt };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < VALIDATION_RETRY_CONFIG.maxRetries) {
                const delay = Math.min(
                    VALIDATION_RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
                    VALIDATION_RETRY_CONFIG.maxDelayMs
                );
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    return {
        valid: false,
        errors: [lastError?.message || 'Validation failed after retries'],
        attempts: VALIDATION_RETRY_CONFIG.maxRetries,
    };
}

/**
 * Validate that clusters account for all findings
 */
export function validateClusters(
    clusters: PainCluster[],
    originalFindings: Finding[]
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

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

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate clusters with evidence freshness checks
 */
export async function validateClustersWithFreshness(
    clusters: PainCluster[],
    originalFindings: Finding[],
    evidenceSnapshots?: Array<{ collectedAt?: Date | string; source?: string }>
): Promise<{
    valid: boolean;
    errors: string[];
    evidenceWarnings: string[];
    attempts: number;
}> {
    // First run validation with retry
    const validationResult = await validateClustersWithRetry(clusters, originalFindings);

    const evidenceWarnings: string[] = [];

    // Check evidence freshness if provided
    if (evidenceSnapshots && evidenceSnapshots.length > 0) {
        const verification = verifyEvidenceBatch(evidenceSnapshots);

        if (verification.hasStaleEvidence) {
            for (const stale of verification.stale) {
                evidenceWarnings.push(
                    `Evidence from ${stale.source} is ${stale.ageHours.toFixed(1)}h old (stale)`
                );
            }
        }

        if (verification.unknown.length > 0) {
            evidenceWarnings.push(
                `${verification.unknown.length} evidence items have unknown collection time`
            );
        }
    }

    return {
        valid: validationResult.valid && evidenceWarnings.length === 0,
        errors: [...validationResult.errors, ...evidenceWarnings],
        evidenceWarnings,
        attempts: validationResult.attempts,
    };
}
