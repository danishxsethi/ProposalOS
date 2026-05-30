/**
 * Single Experiment API
 * GET - Get experiment details
 * PUT - Update experiment
 * DELETE - Complete/delete experiment
 */

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { checkAndPromoteWinners, manualPromote } from '@/lib/self-evolving-prompts/autoPromotion';

type PrismaWithModels = typeof prisma & {
  aBExperiment: any;
  aBVariant: any;
};

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const prismaWithModels = prisma as PrismaWithModels;

    const experiment = await prismaWithModels.aBExperiment.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            promptVersion: true,
          },
        },
        tenant: true,
      },
    });

    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    return NextResponse.json({ experiment });
  } catch (error) {
    logger.error({ error }, 'Error fetching experiment');
    return NextResponse.json({ error: 'Failed to fetch experiment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = body;

    const prismaWithModels = prisma as PrismaWithModels;

    const experiment = await prismaWithModels.aBExperiment.update({
      where: { id },
      data: {
        status,
        endDate: status === 'completed' || status === 'paused' ? new Date() : undefined,
      },
      include: {
        variants: {
          include: {
            promptVersion: true,
          },
        },
      },
    });

    return NextResponse.json({ experiment });
  } catch (error) {
    logger.error({ error }, 'Error updating experiment');
    return NextResponse.json({ error: 'Failed to update experiment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'complete';
    const winnerVariantId = searchParams.get('winnerVariantId');

    const prismaWithModels = prisma as PrismaWithModels;

    if (action === 'promote' && winnerVariantId) {
      // Promote a specific variant
      const result = await manualPromote(id, winnerVariantId);
      return NextResponse.json({ result });
    } else if (action === 'check') {
      // Check for winner without promoting
      const results = await checkAndPromoteWinners();
      const thisExperimentResult = results.find((r) => r.experimentId === id);
      return NextResponse.json({ result: thisExperimentResult || null });
    } else {
      // Just complete without promotion
      await prismaWithModels.aBExperiment.update({
        where: { id },
        data: {
          status: 'completed',
          endDate: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }
  } catch (error) {
    logger.error({ error }, 'Error completing experiment');
    return NextResponse.json({ error: 'Failed to complete experiment' }, { status: 500 });
  }
}
