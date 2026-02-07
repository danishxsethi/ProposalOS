import { Finding as PrismaFinding } from '@prisma/client';

export interface Finding extends PrismaFinding {
    // Extends Prisma Finding with any additional runtime fields if needed
}

export interface PreCluster {
    key: string; // e.g., "website:performance"
    findings: Finding[];
}

export interface PainCluster {
    id: string;
    rootCause: string; // 1-sentence description
    severity: 'critical' | 'high' | 'medium' | 'low';
    findingIds: string[];
    narrative?: string; // Human-readable explanation
}

export interface DiagnosisResult {
    clusters: PainCluster[];
    metadata: {
        totalFindings: number;
        clusteredFindings: number;
        clusteringConfidence: number; // 0-1
    };
}
