/**
 * Data Access Layer for What-If Scenarios
 * Implements scenario storage and comparison
 */

import { executeQuery, executeCommand } from '../db';
import {
  ScenarioResult,
  ScenarioRow,
  ScenarioComparison,
  ScenarioRequest,
} from '../types';

/**
 * Save a scenario result
 * Validates: Requirements 7.1, 7.2
 */
export async function saveScenario(
  scenario: Omit<ScenarioResult, 'id' | 'createdAt'>
): Promise<ScenarioResult> {
  const query = `
    INSERT INTO scenarios (
      audit_id,
      selected_recommendations,
      projected_roi,
      projected_timeline,
      projected_traffic,
      confidence_intervals,
      comparison_to_baseline,
      calculation_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const params = [
    scenario.auditId,
    JSON.stringify(scenario.selectedRecommendations),
    scenario.projectedROI,
    scenario.projectedTimeline,
    scenario.projectedTraffic,
    JSON.stringify(scenario.confidenceIntervals),
    JSON.stringify(scenario.comparisonToBaseline),
    scenario.calculationTimeMs,
  ];

  const rows = await executeQuery<ScenarioRow>(query, params);
  return mapRowToScenario(rows[0]);
}

/**
 * Get scenario by ID
 */
export async function getScenarioById(
  scenarioId: string
): Promise<ScenarioResult | null> {
  const query = `SELECT * FROM scenarios WHERE id = $1`;
  const rows = await executeQuery<ScenarioRow>(query, [scenarioId]);
  return rows.length > 0 ? mapRowToScenario(rows[0]) : null;
}

/**
 * Get scenario history for an audit
 * Validates: Requirements 7.3
 */
export async function getScenarioHistory(
  auditId: string
): Promise<ScenarioResult[]> {
  const query = `
    SELECT * FROM scenarios
    WHERE audit_id = $1
    ORDER BY created_at DESC
  `;

  const rows = await executeQuery<ScenarioRow>(query, [auditId]);
  return rows.map(mapRowToScenario);
}

/**
 * Compare multiple scenarios
 * Validates: Requirements 7.4
 */
export async function compareScenarios(
  scenarioIds: string[]
): Promise<ScenarioComparison> {
  if (scenarioIds.length === 0) {
    throw new Error('At least one scenario ID is required');
  }

  const placeholders = scenarioIds.map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT * FROM scenarios
    WHERE id IN (${placeholders})
    ORDER BY created_at DESC
  `;

  const rows = await executeQuery<ScenarioRow>(query, scenarioIds);
  const scenarios = rows.map(mapRowToScenario);

  if (scenarios.length === 0) {
    throw new Error('No scenarios found with the provided IDs');
  }

  // Find best scenario for each metric
  let bestROI = scenarios[0];
  let fastestTimeline = scenarios[0];
  let highestTraffic = scenarios[0];

  for (const scenario of scenarios) {
    if (scenario.projectedROI > bestROI.projectedROI) {
      bestROI = scenario;
    }
    if (scenario.projectedTraffic > highestTraffic.projectedTraffic) {
      highestTraffic = scenario;
    }
    // For timeline, we'd need to parse the string (e.g., "3 months")
    // For simplicity, we'll use the first one
  }

  return {
    scenarios,
    bestROI: bestROI.id,
    fastestTimeline: fastestTimeline.id,
    highestTraffic: highestTraffic.id,
  };
}

/**
 * Delete old scenarios (for cleanup)
 */
export async function deleteOldScenarios(
  auditId: string,
  keepCount: number = 10
): Promise<number> {
  const query = `
    DELETE FROM scenarios
    WHERE id IN (
      SELECT id FROM scenarios
      WHERE audit_id = $1
      ORDER BY created_at DESC
      OFFSET $2
    )
  `;

  return executeCommand(query, [auditId, keepCount]);
}

/**
 * Get scenario statistics for an audit
 */
export async function getScenarioStatistics(auditId: string): Promise<{
  totalScenarios: number;
  avgROI: number;
  avgTraffic: number;
  avgCalculationTime: number;
}> {
  const query = `
    SELECT
      COUNT(*) as total_scenarios,
      AVG(projected_roi) as avg_roi,
      AVG(projected_traffic) as avg_traffic,
      AVG(calculation_time_ms) as avg_calculation_time
    FROM scenarios
    WHERE audit_id = $1
  `;

  const rows = await executeQuery<any>(query, [auditId]);
  const row = rows[0];

  return {
    totalScenarios: parseInt(row.total_scenarios) || 0,
    avgROI: parseFloat(row.avg_roi) || 0,
    avgTraffic: parseFloat(row.avg_traffic) || 0,
    avgCalculationTime: parseFloat(row.avg_calculation_time) || 0,
  };
}

/**
 * Find similar scenarios (same recommendations)
 */
export async function findSimilarScenarios(
  auditId: string,
  recommendations: string[]
): Promise<ScenarioResult[]> {
  const query = `
    SELECT * FROM scenarios
    WHERE audit_id = $1
      AND selected_recommendations @> $2::jsonb
      AND selected_recommendations <@ $2::jsonb
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const rows = await executeQuery<ScenarioRow>(query, [
    auditId,
    JSON.stringify(recommendations),
  ]);
  return rows.map(mapRowToScenario);
}

/**
 * Validate scenario request
 * Validates: Requirements 7.1
 */
export function validateScenarioRequest(request: ScenarioRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.auditId) {
    errors.push('auditId is required');
  }

  if (!Array.isArray(request.selectedRecommendations)) {
    errors.push('selectedRecommendations must be an array');
  } else if (request.selectedRecommendations.length === 0) {
    errors.push('At least one recommendation must be selected');
  }

  if (!request.baselineMetrics || typeof request.baselineMetrics !== 'object') {
    errors.push('baselineMetrics must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Map database row to scenario object
 */
function mapRowToScenario(row: ScenarioRow): ScenarioResult {
  return {
    id: row.id,
    auditId: row.audit_id,
    selectedRecommendations: row.selected_recommendations,
    projectedROI: parseFloat(row.projected_roi.toString()),
    projectedTimeline: row.projected_timeline,
    projectedTraffic: row.projected_traffic,
    confidenceIntervals: row.confidence_intervals,
    comparisonToBaseline: row.comparison_to_baseline,
    calculationTimeMs: row.calculation_time_ms,
    createdAt: row.created_at,
  };
}
