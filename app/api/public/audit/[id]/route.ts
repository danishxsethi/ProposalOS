import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

/**
 * GET /api/public/audit/[id]
 * Public status-polling endpoint for audits created via POST /api/public/audit.
 *
 * Tenant resolution: audits created through the public endpoint are always owned
 * by the system tenant (domain: 'proposalengine.com'). We resolve that tenant ID
 * via a narrow bypass lookup, then read the audit under the correct tenant context.
 * This prevents MissingTenantError and ensures RLS is enforced for the read.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Step 1: Resolve the system tenant ID via a narrow bypass.
    // This is safe because we are only reading the tenant record by its well-known
    // domain — no tenant-scoped data is accessed at this point.
    const systemTenant = await runWithTenantBypass(
      'public-audit-status-system-tenant-discovery',
      () =>
        prisma.tenant.findUnique({
          where: { domain: 'proposalengine.com' },
          select: { id: true },
        })
    );

    if (!systemTenant) {
      logger.warn({ auditId: id }, 'public-audit-status: system tenant not found');
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 2: Read the audit under the system tenant context.
    // RLS will enforce that only audits belonging to this tenant are visible.
    const audit = await runWithTenantAsync(systemTenant.id, () =>
      prisma.audit.findUnique({
        where: { id },
        select: {
          status: true,
          modulesCompleted: true,
          overallScore: true,
          findings: {
            where: { type: 'PAINKILLER' }, // Only show painkillers for teaser
            take: 3,
            select: {
              title: true,
              impactScore: true,
              category: true,
            },
          },
        },
      })
    );

    if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(audit);
  } catch (error) {
    logger.error(
      {
        event: 'public_audit_status.failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch public audit status'
    );
    return NextResponse.json({ error: 'Error' }, { status: 500 });
  }
}
