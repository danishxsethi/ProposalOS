import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deliveryGraph } from '@/lib/graph/delivery-graph';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id: params.proposalId },
      include: { audit: true },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const bundle = await prisma.deliveryBundle.findUnique({
      where: { proposalId: params.proposalId },
    });

    return NextResponse.json({
      zipUrl: bundle?.zipUrl,
      status: bundle?.status || 'not_started',
      artifactCount: bundle?.artifactCount || 0,
      createdAt: bundle?.createdAt,
    });
  } catch (error) {
    console.error('Failed to get bundle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id: params.proposalId },
      include: {
        audit: {
          include: {
            findings: true,
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // Trigger delivery graph
    const result = await deliveryGraph.invoke({
      findings: proposal.audit.findings,
      proposalSections: {
        businessName: proposal.audit.businessName,
        businessUrl: proposal.audit.businessUrl,
        businessCity: proposal.audit.businessCity,
      },
      artifacts: [],
      packages: [],
      bundle: null,
      validationSummary: {
        totalArtifacts: 0,
        validatedCount: 0,
        failedCount: 0,
        rejectionRate: 0,
      },
      tenantId: proposal.audit.tenantId,
      proposalId: params.proposalId,
    });

    return NextResponse.json({
      status: result.bundle?.status || 'failed',
      zipUrl: result.bundle?.zipUrl,
      artifactCount: result.bundle?.artifactCount || 0,
    });
  } catch (error) {
    console.error('Failed to create bundle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
