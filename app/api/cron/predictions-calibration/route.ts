/**
 * app/api/cron/predictions-calibration/route.ts
 *
 * Predictions Calibration Cron Job
 * Calculates prediction accuracy metrics for each prediction type
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

type PrismaWithModels = typeof prisma & {
  prediction: any;
};

interface CalibrationResult {
  predictionType: string;
  totalPredictions: number;
  observedPredictions: number;
  meanAbsoluteError: number;
  calibrationScore: number;
  meanAbsolutePercentageError: number;
  predictionsWithinCI: number;
  ciHitRate: number;
}

/**
 * Calculate calibration metrics for a prediction type
 */
function calculateCalibration(predictions: any[]): CalibrationResult {
  const observed = predictions.filter((p) => p.actualValue !== null);
  const total = predictions.length;

  if (observed.length === 0) {
    return {
      predictionType: predictions[0]?.predictionType || 'unknown',
      totalPredictions: total,
      observedPredictions: 0,
      meanAbsoluteError: 0,
      calibrationScore: 0,
      meanAbsolutePercentageError: 0,
      predictionsWithinCI: 0,
      ciHitRate: 0,
    };
  }

  // Calculate MAE
  let totalAbsoluteError = 0;
  let totalAbsolutePercentageError = 0;
  let predictionsWithinCI = 0;

  for (const p of observed) {
    const predicted = p.predictedValue;
    const actual = p.actualValue;
    const lower = p.confidenceIntervalLower;
    const upper = p.confidenceIntervalUpper;

    // Absolute error
    const absoluteError = Math.abs(predicted - actual);
    totalAbsoluteError += absoluteError;

    // MAPE (avoid division by zero)
    if (actual !== 0) {
      totalAbsolutePercentageError += Math.abs((predicted - actual) / actual);
    }

    // Check if actual is within confidence interval
    if (actual >= lower && actual <= upper) {
      predictionsWithinCI++;
    }
  }

  const mae = totalAbsoluteError / observed.length;
  const mape = totalAbsolutePercentageError / observed.length;
  const ciHitRate = predictionsWithinCI / observed.length;

  // Calibration score: how close CI hit rate is to target (95%)
  const targetCI = 0.95;
  const calibrationScore = 1 - Math.abs(ciHitRate - targetCI);

  return {
    predictionType: observed[0]?.predictionType || 'unknown',
    totalPredictions: total,
    observedPredictions: observed.length,
    meanAbsoluteError: Math.round(mae * 1000) / 1000,
    meanAbsolutePercentageError: Math.round(mape * 1000) / 1000,
    calibrationScore: Math.round(calibrationScore * 1000) / 1000,
    predictionsWithinCI,
    ciHitRate: Math.round(ciHitRate * 1000) / 1000,
  };
}

/**
 * Inner handler for predictions calibration cron
 */
async function handlePredictionsCalibration(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const prismaWithModels = prisma as PrismaWithModels;

    // Get all predictions with observed values
    const allPredictions = await prismaWithModels.prediction.findMany({
      where: {
        actualValue: {
          not: null,
        },
      },
    });

    // Group by prediction type
    const byType = new Map<string, any[]>();
    for (const p of allPredictions) {
      const type = p.predictionType;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(p);
    }

    // Calculate calibration for each type
    const results: CalibrationResult[] = [];
    for (const [type, predictions] of byType.entries()) {
      const calibration = calculateCalibration(predictions);
      results.push(calibration);
      logger.info(
        {
          predictionType: type,
          observedPredictions: calibration.observedPredictions,
          mae: calibration.meanAbsoluteError,
          calibrationScore: calibration.calibrationScore,
        },
        `Calculated calibration for ${type}`
      );
    }

    // Log summary
    const summary = {
      totalTypes: results.length,
      totalPredictions: results.reduce((sum, r) => sum + r.totalPredictions, 0),
      totalObserved: results.reduce((sum, r) => sum + r.observedPredictions, 0),
      avgCalibrationScore:
        results.reduce((sum, r) => sum + r.calibrationScore, 0) / (results.length || 1),
    };

    logger.info(summary, 'Predictions calibration completed');

    const response = NextResponse.json({
      success: true,
      calibration: results,
      summary,
      timestamp: new Date().toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error: String(error) }, 'Error calculating calibration');
    const internalError = new InternalError('Predictions calibration cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: NextRequest): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handlePredictionsCalibration(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const POST = rateLimitedHandler;
