import { NextRequest, NextResponse } from 'next/server';

import { withRole } from '@/lib/auth/rbac';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { deliveryEngine } from '@/lib/pipeline/deliveryEngine';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

async function getBundle(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  try {
    const { proposalId } = await params;
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId },
      select: { id: true },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const bundle = await prisma.deliveryBundle.findFirst({
      where: { proposalId, tenantId },
    });

    return NextResponse.json({
      status: bundle?.status || 'not_started',
      artifactCount: bundle?.artifactCount || 0,
      createdAt: bundle?.createdAt,
      downloadStatus: bundle?.zipUrl ? 'access_controlled_download_required' : 'unavailable',
    });
  } catch (error) {
    logger.error('Failed to get bundle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function queueDelivery(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  try {
    const { proposalId } = await params;
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId },
      include: { acceptance: { select: { tier: true } } },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }
    if (!proposal.acceptance) {
      return NextResponse.json(
        { error: 'Delivery can only begin after a proposal is accepted' },
        { status: 409 }
      );
    }

    const tasks = await deliveryEngine.generateDeliverables(proposal.id, proposal.acceptance.tier);

    return NextResponse.json(
      {
        status: 'queued',
        proposalId: proposal.id,
        taskIds: tasks.map((task) => task.id),
        message: 'Delivery tasks are queued for an approved execution adapter.',
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('Failed to create bundle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(withRole('agency_admin', getBundle));
export const POST = withAuth(withRole('agency_admin', queueDelivery));
