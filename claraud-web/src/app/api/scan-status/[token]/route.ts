import { NextRequest, NextResponse } from 'next/server';

import { apiClient } from '@/lib/api-client';
import { autoPipelineTriggerStore } from '@/lib/stores';
import { ScanStatus } from '@/lib/types';

import { FRONTEND_AUDIT_CATEGORIES, FRONTEND_AUDIT_CATEGORY_MAP } from '@shared/audit';

const moduleMapping = FRONTEND_AUDIT_CATEGORY_MAP;
const ALL_FRONTEND_CATEGORIES = [...FRONTEND_AUDIT_CATEGORIES];

function shouldTriggerAutoPipeline(audit: any): boolean {
  const isComplete =
    audit.status === 'COMPLETE' || audit.status === 'PARTIAL' || audit.status === 'DEGRADED';
  const hasExistingProposal = Array.isArray(audit.proposals) && audit.proposals.length > 0;
  return isComplete && !hasExistingProposal;
}

function triggerAutoPipelineOnce(auditId: string): void {
  if (autoPipelineTriggerStore.has(auditId)) {
    return;
  }

  autoPipelineTriggerStore.set(auditId, { triggeredAt: Date.now() });

  apiClient
    .runDiagnosis(auditId)
    .then(() => apiClient.generateProposal(auditId))
    .catch((err) => {
      autoPipelineTriggerStore.delete(auditId);
      console.error('[Auto-pipeline] Failed to trigger diagnosis/proposal:', err);
    });
}

function mapAuditToScanStatus(audit: any): ScanStatus {
  const completedModules = audit.modulesCompleted || [];
  const failedModules = audit.modulesFailed || [];
  const failedModuleNames = failedModules
    .map((m: any) => (typeof m === 'string' ? m : m?.module))
    .filter((m: any): m is string => typeof m === 'string');

  const modules = ALL_FRONTEND_CATEGORIES.map((categoryId) => {
    const backendModules = Object.entries(moduleMapping)
      .filter(([_, cats]) => cats.includes(categoryId))
      .map(([backendModule]) => backendModule);

    let status: 'pending' | 'scanning' | 'complete' | 'error' = 'pending';
    let score: number | undefined;
    let findingsCount: number | undefined;

    const hasCompletedModule = backendModules.some((module) => completedModules.includes(module));
    const hasFailedModule = backendModules.some((module) => failedModuleNames.includes(module));

    if (hasCompletedModule) {
      status = 'complete';
      const moduleFindings = (audit.findings || []).filter((f: any) =>
        backendModules.includes(f.module)
      );
      findingsCount = moduleFindings.length;
      if (moduleFindings.length > 0) {
        const avgImpact =
          moduleFindings.reduce((sum: number, f: any) => sum + f.impactScore, 0) /
          moduleFindings.length;
        score = Math.round((10 - avgImpact) * 10) / 10;
      }
    } else if (hasFailedModule) {
      status = 'error';
    } else if (audit.status === 'RUNNING' || audit.status === 'QUEUED') {
      status = 'scanning';
    }

    return { id: categoryId, status, score, findingsCount };
  });

  const isComplete =
    audit.status === 'COMPLETE' || audit.status === 'PARTIAL' || audit.status === 'DEGRADED';
  const overallScore = audit.overallScore
    ? Math.round((audit.overallScore / 10) * 10) / 10
    : undefined;

  // Calculate progress percentage
  const completedCount = modules.filter(
    (m) => m.status === 'complete' || m.status === 'error'
  ).length;
  const progress = Math.round((completedCount / modules.length) * 100);

  return {
    token: audit.id,
    status: isComplete ? 'complete' : audit.status === 'FAILED' ? 'error' : 'scanning',
    modules,
    overallScore,
    progress,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Try the Proposal Engine backend
  const audit = await apiClient.getAudit(token);

  if (audit) {
    const scanStatus = mapAuditToScanStatus(audit);

    if (Array.isArray(audit.proposals) && audit.proposals.length > 0) {
      autoPipelineTriggerStore.delete(token);
    }

    if (shouldTriggerAutoPipeline(audit)) {
      triggerAutoPipelineOnce(token);
    }

    return NextResponse.json(scanStatus, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json(
    { error: 'Scan not found' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } }
  );
}
