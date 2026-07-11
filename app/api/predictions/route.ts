/**
 * Predictions API
 * GET - List predictions
 * POST - Create new prediction
 *
 * P1-17: authenticated, tenant comes exclusively from validated auth context (never from
 * client-supplied query/body tenantId), and results are tenant-scoped via runWithTenantAsync.
 */

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

type PrismaWithModels = typeof prisma & {
  prediction: any;
};

export const GET = withAuth(async (request: Request) => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = new URL(request.url).searchParams;
    const auditId = searchParams.get('auditId');
    const predictionType = searchParams.get('predictionType');

    const prismaWithModels = prisma as PrismaWithModels;

    const where: any = { tenantId };
    if (auditId) where.auditId = auditId;
    if (predictionType) where.predictionType = predictionType;

    const predictions = await runWithTenantAsync(tenantId, () =>
      prismaWithModels.prediction.findMany({
        where,
        orderBy: { predictionDate: 'desc' },
      })
    );

    return NextResponse.json({ predictions });
  } catch (error) {
    logger.error({ error }, 'Error fetching predictions');
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }
});

export const POST = withRole('agency_member', async (request: Request) => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      auditId,
      predictionType,
      predictedValue,
      confidenceIntervalLower,
      confidenceIntervalUpper,
      metadata,
    } = body;

    // Validate required fields
    if (!predictionType || typeof predictionType !== 'string') {
      return NextResponse.json({ error: 'predictionType is required' }, { status: 400 });
    }
    if (typeof predictedValue !== 'number' || Number.isNaN(predictedValue)) {
      return NextResponse.json(
        { error: 'predictedValue is required and must be a number' },
        { status: 400 }
      );
    }
    if (
      typeof confidenceIntervalLower !== 'number' ||
      typeof confidenceIntervalUpper !== 'number'
    ) {
      return NextResponse.json(
        { error: 'confidenceIntervalLower and confidenceIntervalUpper are required numbers' },
        { status: 400 }
      );
    }
    if (auditId !== undefined && typeof auditId !== 'string') {
      return NextResponse.json({ error: 'auditId must be a string' }, { status: 400 });
    }

    const prismaWithModels = prisma as PrismaWithModels;

    const prediction = await runWithTenantAsync(tenantId, () =>
      prismaWithModels.prediction.create({
        data: {
          auditId: auditId || null,
          predictionType,
          predictedValue,
          confidenceIntervalLower,
          confidenceIntervalUpper,
          tenantId,
          metadata: metadata || {},
          predictionDate: new Date(),
        },
      })
    );

    logger.info(
      {
        predictionId: prediction.id,
        predictionType,
      },
      'Created prediction'
    );

    return NextResponse.json({ prediction }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error creating prediction');
    return NextResponse.json({ error: 'Failed to create prediction' }, { status: 500 });
  }
});
