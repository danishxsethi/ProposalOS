/**
 * Data Access Layer for What-If Scenarios
 * Implements scenario storage and comparison
 */

import { getTenantRuntimeContextFromStore } from '@/lib/tenant/context';

import { executeCommand, executeQuery } from '../db';
import { ScenarioComparison, ScenarioRequest, ScenarioResult, ScenarioRow } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCENARIO_SELECT = `
  SELECT
    id,
    "auditId" AS audit_id,
    "selectedRecommendations" AS selected_recommendations,
    "projectedROI" AS projected_roi,
    "projectedTimeline" AS projected_timeline,
    "projectedTraffic" AS projected_traffic,
    "confidenceIntervals" AS confidence_intervals,
    "comparisonToBaseline" AS comparison_to_baseline,
    "calculationTimeMs" AS calculation_time_ms,
    "createdAt" AS created_at
  FROM "Scenario"
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
 * Save a scenario result
 * Validates: Requirements 7.1, 7.2
 */
export async function saveScenario(
  scenario: Omit<ScenarioResult, 'id' | 'createdAt'>
): Promise<ScenarioResult> {
  const tenantId = getRequiredTenantId('Scenario.save');
  const query = `
    INSERT INTO "Scenario" (
      "auditId",
      "selectedRecommendations",
      "projectedROI",
      "projectedTimeline",
      "projectedTraffic",
      "confidenceIntervals",
      "comparisonToBaseline",
      "calculationTimeMs",
      "tenantId"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id,
      "auditId" AS audit_id,
      "selectedRecommendations" AS selected_recommendations,
      "projectedROI" AS projected_roi,
      "projectedTimeline" AS projected_timeline,
      "projectedTraffic" AS projected_traffic,
      "confidenceIntervals" AS confidence_intervals,
      "comparisonToBaseline" AS comparison_to_baseline,
      "calculationTimeMs" AS calculation_time_ms,
      "createdAt" AS created_at
  `;

  const params = [
    scenario.auditId,
    scenario.selectedRecommendations,
    scenario.projectedROI,
    scenario.projectedTimeline,
    scenario.projectedTraffic,
    scenario.confidenceIntervals,
    scenario.comparisonToBaseline,
    scenario.calculationTimeMs,
    tenantId,
  ];

  const rows = await executeQuery<ScenarioRow>(query, params, {
    operationName: 'Scenario.save',
    requireTenant: true,
  });
  return mapRowToScenario(requireFirstRow(rows, 'Scenario.save'));
}

/**
 * Get scenario by ID
 */
export async function getScenarioById(scenarioId: string): Promise<ScenarioResult | null> {
  const tenantId = getRequiredTenantId('Scenario.getById');
  const query = `
    ${SCENARIO_SELECT}
    WHERE id = $1 AND "tenantId" = $2
  `;
  const rows = await executeQuery<ScenarioRow>(query, [scenarioId, tenantId], {
    operationName: 'Scenario.getById',
    requireTenant: true,
  });
  const row = rows[0];
  return row ? mapRowToScenario(row) : null;
}

/**
 * Get scenario history for an audit
 * Validates: Requirements 7.3
 */
export async function getScenarioHistory(auditId: string): Promise<ScenarioResult[]> {
  const tenantId = getRequiredTenantId('Scenario.getHistory');
  const query = `
    ${SCENARIO_SELECT}
    WHERE "auditId" = $1 AND "tenantId" = $2
    ORDER BY "createdAt" DESC
  `;

  const rows = await executeQuery<ScenarioRow>(query, [auditId, tenantId], {
    operationName: 'Scenario.getHistory',
    requireTenant: true,
  });
  return rows.map(mapRowToScenario);
}

/**
 * Compare multiple scenarios
 * Validates: Requirements 7.4
 */
export async function compareScenarios(scenarioIds: string[]): Promise<ScenarioComparison> {
  if (scenarioIds.length === 0) {
    throw new Error('At least one scenario ID is required');
  }

  const tenantId = getRequiredTenantId('Scenario.compare');
  const scenarioPlaceholders = scenarioIds.map((_, index) => `$${index + 1}`).join(', ');
  const tenantIdIndex = scenarioIds.length + 1;
  const query = `
    ${SCENARIO_SELECT}
    WHERE id IN (${scenarioPlaceholders})
      AND "tenantId" = $${tenantIdIndex}
    ORDER BY "createdAt" DESC
  `;

  const rows = await executeQuery<ScenarioRow>(query, [...scenarioIds, tenantId], {
    operationName: 'Scenario.compare',
    requireTenant: true,
  });
  const scenarios = rows.map(mapRowToScenario);

  if (scenarios.length === 0) {
    throw new Error('No scenarios found with the provided IDs');
  }

  const firstScenario = scenarios[0];
  if (!firstScenario) {
    throw new Error('No scenarios found with the provided IDs');
  }

  let bestROI = firstScenario;
  const fastestTimeline = firstScenario;
  let highestTraffic = firstScenario;

  for (const scenario of scenarios) {
    if (scenario.projectedROI > bestROI.projectedROI) {
      bestROI = scenario;
    }
    if (scenario.projectedTraffic > highestTraffic.projectedTraffic) {
      highestTraffic = scenario;
    }
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
export async function deleteOldScenarios(auditId: string, keepCount: number = 10): Promise<number> {
  const tenantId = getRequiredTenantId('Scenario.deleteOld');
  const query = `
    DELETE FROM "Scenario"
    WHERE id IN (
      SELECT id FROM "Scenario"
      WHERE "auditId" = $1
        AND "tenantId" = $2
      ORDER BY "createdAt" DESC
      OFFSET $3
    )
      AND "tenantId" = $2
  `;

  return executeCommand(query, [auditId, tenantId, keepCount], {
    operationName: 'Scenario.deleteOld',
    requireTenant: true,
  });
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
  const tenantId = getRequiredTenantId('Scenario.getStatistics');
  const query = `
    SELECT
      COUNT(*) as total_scenarios,
      AVG("projectedROI") as avg_roi,
      AVG("projectedTraffic") as avg_traffic,
      AVG("calculationTimeMs") as avg_calculation_time
    FROM "Scenario"
    WHERE "auditId" = $1
      AND "tenantId" = $2
  `;

  const rows = await executeQuery<{
    total_scenarios: string;
    avg_roi: string | null;
    avg_traffic: string | null;
    avg_calculation_time: string | null;
  }>(query, [auditId, tenantId], {
    operationName: 'Scenario.getStatistics',
    requireTenant: true,
  });
  const row = rows[0];

  return {
    totalScenarios: Number.parseInt(row?.total_scenarios ?? '0', 10) || 0,
    avgROI: Number.parseFloat(row?.avg_roi ?? '0') || 0,
    avgTraffic: Number.parseFloat(row?.avg_traffic ?? '0') || 0,
    avgCalculationTime: Number.parseFloat(row?.avg_calculation_time ?? '0') || 0,
  };
}

/**
 * Find similar scenarios (same recommendations)
 */
export async function findSimilarScenarios(
  auditId: string,
  recommendations: string[]
): Promise<ScenarioResult[]> {
  const tenantId = getRequiredTenantId('Scenario.findSimilar');
  const query = `
    ${SCENARIO_SELECT}
    WHERE "auditId" = $1
      AND "tenantId" = $2
      AND "selectedRecommendations" @> $3::jsonb
      AND "selectedRecommendations" <@ $3::jsonb
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  const rows = await executeQuery<ScenarioRow>(
    query,
    [auditId, tenantId, JSON.stringify(recommendations)],
    {
      operationName: 'Scenario.findSimilar',
      requireTenant: true,
    }
  );
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
    projectedROI: Number.parseFloat(row.projected_roi.toString()),
    projectedTimeline: row.projected_timeline,
    projectedTraffic: row.projected_traffic,
    confidenceIntervals: row.confidence_intervals,
    comparisonToBaseline: row.comparison_to_baseline,
    calculationTimeMs: row.calculation_time_ms,
    createdAt: row.created_at,
  };
}
