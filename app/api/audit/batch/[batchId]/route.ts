/**
 * GET /api/audit/batch/[batchId]
 *
 * Tenant-scoped batch status endpoint.
 *
 * Returns a two-level summary:
 *   1. Audit record statuses (existing behaviour — fast path)
 *   2. AuditJob queue statuses (new — includes retry/dead detail)
 *
 * Cross-tenant access is prevented by always filtering on the authenticated
 * tenantId.  A batchId that doesn't belong to this tenant returns 404.
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getBatchStatus } from '@/lib/queue/auditJobQueue';
import { getTenantId } from '@/lib/tenant/context';

export const GET = withAuth(
  async (req: Request, { params }: { params: Promise<{ batchId: string }> }) => {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const { batchId } = await params;

    // ── Audit records (existing) ──────────────────────────────────────────────
    const audits = await prisma.audit.findMany({
      where: { batchId, tenantId },
      select: {
        id: true,
        businessName: true,
        status: true,
        apiCostCents: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (audits.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const total = audits.length;
    const auditCompleted = audits.filter(
      (a) => a.status === 'COMPLETE' || a.status === 'PARTIAL'
    ).length;
    const auditFailed = audits.filter((a) => a.status === 'FAILED').length;

    // ── Job queue status (new) ────────────────────────────────────────────────
    const jobSummary = await getBatchStatus(batchId, tenantId);

    const isBatchComplete =
      jobSummary != null
        ? // All jobs in terminal state
          jobSummary.queued === 0 && jobSummary.running === 0
        : // Fallback to audit records if jobs not yet created
          auditCompleted + auditFailed === total;

    return NextResponse.json({
      batchId,
      status: isBatchComplete ? 'COMPLETED' : 'IN_PROGRESS',
      summary: {
        total,
        completed: auditCompleted,
        failed: auditFailed,
        pending: total - auditCompleted - auditFailed,
      },
      jobs: jobSummary ?? null,
      audits,
    });
  }
);
