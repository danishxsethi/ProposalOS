import { Finding } from '@/lib/diagnosis/types';
import { CostTracker } from '@/lib/costs/costTracker';

export interface DiagnosisCluster {
    id: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    findings: Finding[];
    rootCause: string;
    narrative?: string;
    confidenceScore?: number;
}

export interface DiagnosisRanking {
    clusterId: string;
    rank: number;
    impactScore: number;
    estimatedROI: number;
    effortLevel: 'quick_win' | 'moderate' | 'major_effort';
}

export interface DiagnosisValidation {
    valid: boolean;
    issues: string[];
    clusterCount: number;
    findingsCovered: number;
    totalFindings: number;
}

export interface DiagnosisState {
    auditId: string;
    findings: Finding[];
    evidenceSnapshots: any[];
    clusters: DiagnosisCluster[];
    rankings: DiagnosisRanking[];
    painkillers: DiagnosisCluster[];
    vitamins: DiagnosisCluster[];
    narratives: Array<{ clusterId: string; narrative: string }>;
    validation: DiagnosisValidation | null;
    retryCount: number;
    qaRetryCount: number;
    degraded: boolean;
    errors: Array<{ node: string; error: string; timestamp: string }>;
    lastQaScore: number;
    costTracker?: CostTracker;
}
