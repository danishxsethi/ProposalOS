import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { proposalId: params.proposalId },
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
    console.error('Failed to get artifacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
