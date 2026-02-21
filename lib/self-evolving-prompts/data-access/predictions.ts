/**
 * Data Access Layer for Predictions
 * Implements prediction storage and calibration
 */

import { executeQuery, executeCommand } from '../db';
import {
  PredictionRecord,
  PredictionRow,
  CalibrationMetrics,
  AccuracyTrend,
  TimeRange,
} from '../types';

/**
 * Record a new prediction
 * Validates: Requirements 6.1
 */
export async function recordPrediction(
  prediction: Omit<PredictionRecord, 'id' | 'createdAt'>
): Promise<PredictionRecord> {
  const query = `
    INSERT INTO predictions (
      audit_id,
      prediction_type,
      predicted_value,
      confidence_interval_lower,
      confidence_interval_upper,
      prediction_date,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const params = [
    prediction.auditId,
    prediction.predictionType,
    prediction.predictedValue,
    prediction.confidenceIntervalLower,
    prediction.confidenceIntervalUpper,
    prediction.predictionDate,
    JSON.stringify(prediction.metadata || {}),
  ];

  const rows = await executeQuery<PredictionRow>(query, params);
  return mapRowToPrediction(rows[0]);
}

/**
 * Record the actual outcome for a prediction
 * Validates: Requirements 6.2
 */
export async function recordOutcome(
  predictionId: string,
  actualValue: number
): Promise<void> {
  const query = `
    UPDATE predictions
    SET actual_value = $2, observed_at = NOW()
    WHERE id = $1
  `;

  await executeCommand(query, [predictionId, actualValue]);
}

/**
 * Get predictions by audit ID
 */
export async function getPredictionsByAudit(
  auditId: string
): Promise<PredictionRecord[]> {
  const query = `
    SELECT * FROM predictions
    WHERE audit_id = $1
    ORDER BY prediction_date DESC
  `;

  const rows = await executeQuery<PredictionRow>(query, [auditId]);
  return rows.map(mapRowToPrediction);
}

/**
 * Get predictions by type
 */
export async function getPredictionsByType(
  predictionType: string,
  timeRange?: TimeRange
): Promise<PredictionRecord[]> {
  let query = `
    SELECT * FROM predictions
    WHERE prediction_type = $1
  `;
  const params: any[] = [predictionType];

  if (timeRange) {
    query += ` AND prediction_date >= $2 AND prediction_date <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  query += ` ORDER BY prediction_date DESC`;

  const rows = await executeQuery<PredictionRow>(query, params);
  return rows.map(mapRowToPrediction);
}

/**
 * Get predictions with observed outcomes
 */
export async function getPredictionsWithOutcomes(
  predictionType?: string
): Promise<PredictionRecord[]> {
  let query = `
    SELECT * FROM predictions
    WHERE observed_at IS NOT NULL
  `;
  const params: any[] = [];

  if (predictionType) {
    query += ` AND prediction_type = $1`;
    params.push(predictionType);
  }

  query += ` ORDER BY observed_at DESC`;

  const rows = await executeQuery<PredictionRow>(query, params);
  return rows.map(mapRowToPrediction);
}

/**
 * Calculate calibration metrics for a prediction type
 * Validates: Requirements 6.3
 */
export async function getCalibrationMetrics(
  predictionType: string
): Promise<CalibrationMetrics> {
  const query = `
    SELECT
      COUNT(*) as total_predictions,
      COUNT(actual_value) as observed_predictions,
      AVG(ABS(predicted_value - actual_value)) as mean_absolute_error,
      SUM(
        CASE
          WHEN actual_value BETWEEN confidence_interval_lower AND confidence_interval_upper
          THEN 1
          ELSE 0
        END
      )::FLOAT / NULLIF(COUNT(actual_value), 0) as calibration_score
    FROM predictions
    WHERE prediction_type = $1
  `;

  const rows = await executeQuery<any>(query, [predictionType]);
  const row = rows[0];

  const totalPredictions = parseInt(row.total_predictions) || 0;
  const observedPredictions = parseInt(row.observed_predictions) || 0;
  const meanAbsoluteError = parseFloat(row.mean_absolute_error) || 0;
  const calibrationScore = parseFloat(row.calibration_score) || 0;

  // Calculate recommended adjustment based on calibration score
  // If calibration score is low, widen confidence intervals
  const targetCalibration = 0.95; // 95% of predictions should fall within CI
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
  const query = `
    SELECT
      DATE_TRUNC('day', observed_at) as date,
      AVG(ABS(predicted_value - actual_value) / NULLIF(actual_value, 0)) as accuracy,
      COUNT(*) as sample_size
    FROM predictions
    WHERE prediction_type = $1
      AND observed_at IS NOT NULL
      AND observed_at >= $2
      AND observed_at <= $3
    GROUP BY DATE_TRUNC('day', observed_at)
    ORDER BY date ASC
  `;

  const rows = await executeQuery<any>(query, [
    predictionType,
    timeRange.start,
    timeRange.end,
  ]);

  return rows.map((row) => ({
    date: row.date,
    accuracy: 1 - parseFloat(row.accuracy), // Convert error to accuracy
    sampleSize: parseInt(row.sample_size),
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
  // This would be used in future predictions, not retroactively
  // Store the adjustment factor in a configuration table or cache
  // For now, this is a placeholder that demonstrates the concept
  console.log(
    `Adjusting confidence intervals for ${predictionType} by factor ${adjustmentFactor}`
  );
}

/**
 * Get prediction by ID
 */
export async function getPredictionById(
  predictionId: string
): Promise<PredictionRecord | null> {
  const query = `SELECT * FROM predictions WHERE id = $1`;
  const rows = await executeQuery<PredictionRow>(query, [predictionId]);
  return rows.length > 0 ? mapRowToPrediction(rows[0]) : null;
}

/**
 * Calculate accuracy for a prediction
 * Validates: Requirements 6.2
 */
export function calculateAccuracy(
  predictedValue: number,
  actualValue: number
): number {
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
  return (
    actualValue >= confidenceIntervalLower &&
    actualValue <= confidenceIntervalUpper
  );
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
    predictedValue: parseFloat(row.predicted_value.toString()),
    confidenceIntervalLower: parseFloat(
      row.confidence_interval_lower.toString()
    ),
    confidenceIntervalUpper: parseFloat(
      row.confidence_interval_upper.toString()
    ),
    actualValue: row.actual_value
      ? parseFloat(row.actual_value.toString())
      : undefined,
    observedAt: row.observed_at || undefined,
    predictionDate: row.prediction_date,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}
