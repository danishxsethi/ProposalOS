/**
 * Predictions API
 * GET - List predictions
 * POST - Create new prediction
 */

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

type PrismaWithModels = typeof prisma & {
  prediction: any;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const auditId = searchParams.get('auditId');
    const predictionType = searchParams.get('predictionType');
    const tenantId = searchParams.get('tenantId');

    const prismaWithModels = prisma as PrismaWithModels;

    const where: any = {};
    if (auditId) where.auditId = auditId;
    if (predictionType) where.predictionType = predictionType;
    if (tenantId) where.tenantId = tenantId;

    const predictions = await prismaWithModels.prediction.findMany({
      where,
      include: {
        tenant: true,
      },
      orderBy: { predictionDate: 'desc' },
    });

    return NextResponse.json({ predictions });
  } catch (error) {
    logger.error({ error }, 'Error fetching predictions');
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      auditId,
      predictionType,
      predictedValue,
      confidenceIntervalLower,
      confidenceIntervalUpper,
      tenantId,
      metadata,
    } = body;

    // Validate required fields
    if (!predictionType || predictedValue === undefined) {
      return NextResponse.json(
        { error: 'predictionType and predictedValue are required' },
        { status: 400 }
      );
    }

    if (confidenceIntervalLower === undefined || confidenceIntervalUpper === undefined) {
      return NextResponse.json(
        { error: 'confidenceIntervalLower and confidenceIntervalUpper are required' },
        { status: 400 }
      );
    }

    const prismaWithModels = prisma as PrismaWithModels;

    const prediction = await prismaWithModels.prediction.create({
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
    });

    logger.info({
      predictionId: prediction.id,
      predictionType,
      predictedValue,
    }, 'Created prediction');

    return NextResponse.json({ prediction }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error creating prediction');
    return NextResponse.json({ error: 'Failed to create prediction' }, { status: 500 });
  }
}
