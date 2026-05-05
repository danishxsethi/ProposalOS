/**
 * A/B Testing Experiments API
 * GET - List all experiments
 * POST - Create new experiment
 */

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// Type helper for new Prisma models
type PrismaWithModels = typeof prisma & {
  aBExperiment: any;
  aBVariant: any;
  promptVersion: any;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const nodeId = searchParams.get('nodeId');
    const status = searchParams.get('status');
    const tenantId = searchParams.get('tenantId');

    const prismaWithModels = prisma as PrismaWithModels;

    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    const experiments = await prismaWithModels.aBExperiment.findMany({
      where,
      include: {
        variants: {
          include: {
            promptVersion: true,
          },
        },
        tenant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ experiments });
  } catch (error) {
    logger.error({ error }, 'Error fetching experiments');
    return NextResponse.json({ error: 'Failed to fetch experiments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, nodeId, tenantId, variants } = body;

    // Validate required fields
    if (!name || !nodeId || !variants || variants.length < 2) {
      return NextResponse.json(
        { error: 'Name, nodeId, and at least 2 variants are required' },
        { status: 400 }
      );
    }

    // Validate traffic percentages sum to 100
    const totalPercentage = variants.reduce(
      (sum: number, v: any) => sum + (v.trafficPercentage || 0),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return NextResponse.json(
        { error: `Traffic percentages must sum to 100, got ${totalPercentage}` },
        { status: 400 }
      );
    }

    const prismaWithModels = prisma as PrismaWithModels;

    // Create experiment with variants in a transaction
    const result = await prismaWithModels.$transaction(async (tx: any) => {
      // Create the experiment
      const experiment = await tx.aBExperiment.create({
        data: {
          name,
          nodeId,
          tenantId,
          status: 'active',
          startDate: new Date(),
        },
      });

      // Create variants
      const createdVariants = await Promise.all(
        variants.map(async (variant: any) => {
          // Verify prompt version exists
          const promptVersion = await tx.promptVersion.findUnique({
            where: { versionHash: variant.promptVersionHash },
          });

          if (!promptVersion) {
            throw new Error(`Prompt version ${variant.promptVersionHash} not found`);
          }

          return tx.aBVariant.create({
            data: {
              experimentId: experiment.id,
              tenantId: experiment.tenantId,
              promptVersionHash: variant.promptVersionHash,
              trafficPercentage: variant.trafficPercentage,
              sampleSize: 0,
              avgQualityScore: null,
              avgDownstreamImpact: null,
            },
            include: {
              promptVersion: true,
            },
          });
        })
      );

      return { experiment, variants: createdVariants };
    });

    logger.info(
      {
        experimentId: result.experiment.id,
        name,
        nodeId,
        variantCount: variants.length,
      },
      'Created A/B experiment'
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error creating experiment');
    return NextResponse.json({ error: 'Failed to create experiment' }, { status: 500 });
  }
}
