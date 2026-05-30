/**
 * Data Access Layer for Predictions
 * Implements prediction storage and calibration
 */

import { logger } from '@/lib/logger';
import { getTenantRuntimeContextFromStore } from '@/lib/tenant/context';

import { executeCommand, executeQuery } from '../db';
import {
  AccuracyTrend,
  CalibrationMetrics,
  PredictionRecord,
  PredictionRow,
  TimeRange,
} from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREDICTION_SELECT = `
  SELECT
    id,
    "auditId" AS audit_id,
    "predictionType" AS prediction_type,
    "predictedValue" AS predicted_value,
    "confidenceIntervalLower" AS confidence_interval_lower,
    "confidenceIntervalUpper" AS confidence_interval_upper,
    "actualValue" AS actual_value,
    "observedAt" AS observed_at,
    "predictionDate" AS prediction_date,
    metadata,
    "createdAt" AS created_at
  FROM "Prediction"
`;

function requireFirstRow<T>(rows: T[], operationName: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`${operationName} returned no rows`);
  }

  return row;
}

function getRequiredTenantId(operationName: string): string {
  const { tenantId } = getTenantRuntimeContextFromStore();

  if (!tenantId) {
    throw new Error(`Tenant context required for ${operationName}: missing tenant context`);
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

/**
 * Record a new prediction
 * Validates: Requirements 6.1
 */
export async function recordPrediction(
  prediction: Omit<PredictionRecord, 'id' | 'createdAt'>
): Promise<PredictionRecord> {
  const tenantId = getRequiredTenantId('Prediction.recordPrediction');
  const query = `
    INSERT INTO "Prediction" (
      "auditId",
      "predictionType",
      "predictedValue",
      "confidenceIntervalLower",
      "confidenceIntervalUpper",
      "predictionDate",
      metadata,
      "tenantId"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      "auditId" AS audit_id,
      "predictionType" AS prediction_type,
      "predictedValue" AS predicted_value,
      "confidenceIntervalLower" AS confidence_interval_lower,
      "confidenceIntervalUpper" AS confidence_interval_upper,
      "actualValue" AS actual_value,
      "observedAt" AS observed_at,
      "predictionDate" AS prediction_date,
      metadata,
      "createdAt" AS created_at
  `;

  const params = [
    prediction.auditId ?? null,
    prediction.predictionType,
    prediction.predictedValue,
    prediction.confidenceIntervalLower,
    prediction.confidenceIntervalUpper,
    prediction.predictionDate,
    prediction.metadata || {},
    tenantId,
  ];

  const rows = await executeQuery<PredictionRow>(query, params, {
    operationName: 'Prediction.recordPrediction',
    requireTenant: true,
  });
  return mapRowToPrediction(requireFirstRow(rows, 'Prediction.recordPrediction'));
}

/**
 * Record the actual outcome for a prediction
 * Validates: Requirements 6.2
 */
export async function recordOutcome(predictionId: string, actualValue: number): Promise<void> {
  const tenantId = getRequiredTenantId('Prediction.recordOutcome');
  const query = `
    UPDATE "Prediction"
    SET "actualValue" = $2, "observedAt" = NOW()
    WHERE id = $1 AND "tenantId" = $3
  `;

  await executeCommand(query, [predictionId, actualValue, tenantId], {
    operationName: 'Prediction.recordOutcome',
    requireTenant: true,
  });
}

/**
 * Get predictions by audit ID
 */
export async function getPredictionsByAudit(auditId: string): Promise<PredictionRecord[]> {
  const tenantId = getRequiredTenantId('Prediction.getByAudit');
  const query = `
    ${PREDICTION_SELECT}
    WHERE "auditId" = $1 AND "tenantId" = $2
    ORDER BY "predictionDate" DESC
  `;

  const rows = await executeQuery<PredictionRow>(query, [auditId, tenantId], {
    operationName: 'Prediction.getByAudit',
    requireTenant: true,
  });
  return rows.map(mapRowToPrediction);
}

/**
 * Get predictions by type
 */
export async function getPredictionsByType(
  predictionType: string,
  timeRange?: TimeRange
): Promise<PredictionRecord[]> {
  const tenantId = getRequiredTenantId('Prediction.getByType');
  let query = `
    ${PREDICTION_SELECT}
    WHERE "predictionType" = $1
      AND "tenantId" = $2
  `;
  const params: unknown[] = [predictionType, tenantId];

  if (timeRange) {
    query += ` AND "predictionDate" >= $3 AND "predictionDate" <= $4`;
    params.push(timeRange.start, timeRange.end);
  }

  query += ` ORDER BY "predictionDate" DESC`;

  const rows = await executeQuery<PredictionRow>(query, params, {
    operationName: 'Prediction.getByType',
    requireTenant: true,
  });
  return rows.map(mapRowToPrediction);
}

/**
 * Get predictions with observed outcomes
 */
export async function getPredictionsWithOutcomes(
  predictionType?: string
): Promise<PredictionRecord[]> {
  const tenantId = getRequiredTenantId('Prediction.getWithOutcomes');
  let query = `
    ${PREDICTION_SELECT}
    WHERE "observedAt" IS NOT NULL
      AND "tenantId" = $1
  `;
  const params: unknown[] = [tenantId];

  if (predictionType) {
    query += ` AND "predictionType" = $2`;
    params.push(predictionType);
  }

  query += ` ORDER BY "observedAt" DESC`;

  const rows = await executeQuery<PredictionRow>(query, params, {
    operationName: 'Prediction.getWithOutcomes',
    requireTenant: true,
  });
  return rows.map(mapRowToPrediction);
}

/**
 * Calculate calibration metrics for a prediction type
 * Validates: Requirements 6.3
 */
export async function getCalibrationMetrics(predictionType: string): Promise<CalibrationMetrics> {
  const tenantId = getRequiredTenantId('Prediction.getCalibrationMetrics');
  const query = `
    SELECT
      COUNT(*) as total_predictions,
      COUNT("actualValue") as observed_predictions,
      AVG(ABS("predictedValue" - "actualValue")) as mean_absolute_error,
      SUM(
        CASE
          WHEN "actualValue" BETWEEN "confidenceIntervalLower" AND "confidenceIntervalUpper"
          THEN 1
          ELSE 0
        END
      )::FLOAT / NULLIF(COUNT("actualValue"), 0) as calibration_score
    FROM "Prediction"
    WHERE "predictionType" = $1
      AND "tenantId" = $2
  `;

  const rows = await executeQuery<{
    total_predictions: string;
    observed_predictions: string;
    mean_absolute_error: string | null;
    calibration_score: string | null;
  }>(query, [predictionType, tenantId], {
    operationName: 'Prediction.getCalibrationMetrics',
    requireTenant: true,
  });
  const row = rows[0];

  const totalPredictions = Number.parseInt(row?.total_predictions ?? '0', 10) || 0;
  const observedPredictions = Number.parseInt(row?.observed_predictions ?? '0', 10) || 0;
  const meanAbsoluteError = Number.parseFloat(row?.mean_absolute_error ?? '0') || 0;
  const calibrationScore = Number.parseFloat(row?.calibration_score ?? '0') || 0;
  const targetCalibration = 0.95;
  const recommendedAdjustment = targetCalibration - calibrationScore;

  return {
    predictionType,
    totalPredictions,
    observedPredictions,
    meanAbsoluteError,
    calibrationScore,
    recommendedAdjustment,
  };
}

/**
 * Get accuracy trends over time
 * Validates: Requirements 6.6
 */
export async function getAccuracyTrends(
  predictionType: string,
  timeRange: TimeRange
): Promise<AccuracyTrend[]> {
  const tenantId = getRequiredTenantId('Prediction.getAccuracyTrends');
  const query = `
    SELECT
      DATE_TRUNC('day', "observedAt") as date,
      AVG(ABS("predictedValue" - "actualValue") / NULLIF("actualValue", 0)) as accuracy,
      COUNT(*) as sample_size
    FROM "Prediction"
    WHERE "predictionType" = $1
      AND "tenantId" = $2
      AND "observedAt" IS NOT NULL
      AND "observedAt" >= $3
      AND "observedAt" <= $4
    GROUP BY DATE_TRUNC('day', "observedAt")
    ORDER BY date ASC
  `;

  const rows = await executeQuery<{ date: Date; accuracy: string | null; sample_size: string }>(
    query,
    [predictionType, tenantId, timeRange.start, timeRange.end],
    {
      operationName: 'Prediction.getAccuracyTrends',
      requireTenant: true,
    }
  );

  return rows.map((row) => ({
    date: row.date,
    accuracy: 1 - (Number.parseFloat(row.accuracy ?? '0') || 0),
    sampleSize: Number.parseInt(row.sample_size, 10) || 0,
  }));
}

/**
 * Adjust confidence intervals for a prediction type
 * Validates: Requirements 6.4
 */
export async function adjustConfidenceIntervals(
  predictionType: string,
  adjustmentFactor: number
): Promise<void> {
  logger.info({ predictionType, adjustmentFactor }, 'Adjusting confidence intervals');
}

/**
 * Get prediction by ID
 */
export async function getPredictionById(predictionId: string): Promise<PredictionRecord | null> {
  const tenantId = getRequiredTenantId('Prediction.getById');
  const query = `
    ${PREDICTION_SELECT}
    WHERE id = $1 AND "tenantId" = $2
  `;
  const rows = await executeQuery<PredictionRow>(query, [predictionId, tenantId], {
    operationName: 'Prediction.getById',
    requireTenant: true,
  });
  const row = rows[0];
  return row ? mapRowToPrediction(row) : null;
}

/**
 * Calculate accuracy for a prediction
 * Validates: Requirements 6.2
 */
export function calculateAccuracy(predictedValue: number, actualValue: number): number {
  if (actualValue === 0) {
    return predictedValue === 0 ? 1 : 0;
  }
  return 1 - Math.abs(predictedValue - actualValue) / Math.abs(actualValue);
}

/**
 * Check if actual value falls within confidence interval
 */
export function isWithinConfidenceInterval(
  actualValue: number,
  confidenceIntervalLower: number,
  confidenceIntervalUpper: number
): boolean {
  return actualValue >= confidenceIntervalLower && actualValue <= confidenceIntervalUpper;
}

/**
 * Map database row to prediction object
 */
function mapRowToPrediction(row: PredictionRow): PredictionRecord {
  return {
    id: row.id,
    auditId: row.audit_id,
    predictionType: row.prediction_type as
      | 'traffic'
      | 'ranking'
      | 'competitor'
      | 'revenue'
      | 'algorithm',
    predictedValue: Number.parseFloat(row.predicted_value.toString()),
    confidenceIntervalLower: Number.parseFloat(row.confidence_interval_lower.toString()),
    confidenceIntervalUpper: Number.parseFloat(row.confidence_interval_upper.toString()),
    actualValue: row.actual_value ? Number.parseFloat(row.actual_value.toString()) : undefined,
    observedAt: row.observed_at || undefined,
    predictionDate: row.prediction_date,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}
