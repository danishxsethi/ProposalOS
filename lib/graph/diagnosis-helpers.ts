import { DiagnosisCluster } from '@/lib/graph/types';

export const MAX_VALIDATION_RETRIES = 2;

export const PAINKILLER_SEVERITIES = new Set<DiagnosisCluster['severity']>(['critical', 'high']);

export function isPainkillerSeverity(severity: DiagnosisCluster['severity']): boolean {
  return PAINKILLER_SEVERITIES.has(severity);
}

export function getValidationRetryRoute(
  retryCount: number
): 'degrade_and_continue' | 'cluster_root_causes' {
  return retryCount > MAX_VALIDATION_RETRIES ? 'degrade_and_continue' : 'cluster_root_causes';
}
