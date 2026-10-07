import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

async function getArtifacts(
  request: Request,
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
    if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { proposalId, tenantId },
      select: {
        id: true,
        artifactType: true,
        status: true,
        confidenceLevel: true,
        estimatedImpact: true,
        validationResults: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      artifacts,
      count: artifacts.length,
    });
  } catch (error) {
    logger.error('Failed to get artifacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withAuth(getArtifacts);
