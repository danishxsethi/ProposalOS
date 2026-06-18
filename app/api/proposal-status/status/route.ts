import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * PATCH /api/proposal-status/status
 * Update proposal status (draft → ready → sent → viewed → accepted/rejected)
 * Expects { id, status } in request body.
 *
 * Auth: requires authenticated session or API key via withAuth.
 * Tenant: RLS enforced by Prisma middleware (withAuth sets runWithTenantAsync context).
 * Fix: register #4 — previously had zero auth guards. [#4]
 */
async function handleUpdateStatus(request: Request): Promise<NextResponse> {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing proposal id' }, { status: 400 });
    }

    // Validate status
    const validStatuses = ['draft', 'ready', 'sent', 'viewed', 'accepted', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Find proposal — RLS middleware enforces tenant isolation automatically;
    // the explicit tenantId filter is defense-in-depth.
    const proposal = await prisma.proposal.findFirst({
      where: { id, tenantId },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // Update status and set timestamp if transitioning to 'sent'
    const updateData: Record<string, unknown> = { status };
    if (status === 'sent' && !proposal.sentAt) {
      updateData.sentAt = new Date();
    }

    const updatedProposal = await prisma.proposal.update({
      where: { id, tenantId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      proposal: {
        id: updatedProposal.id,
        status: updatedProposal.status,
        sentAt: updatedProposal.sentAt,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update proposal status' }, { status: 500 });
  }
}

export const PATCH = withAuth(handleUpdateStatus);
