/**
 * Data Access Layer for Prompt Performance Logs
 * Implements CRUD operations and aggregate queries
 */

import { getTenantRuntimeContextFromStore } from '@/lib/tenant/context';

import { executeQuery } from '../db';
import {
  AggregateMetrics,
  PromptPerformanceLog,
  PromptPerformanceLogRow,
  TimeRange,
} from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROMPT_PERFORMANCE_SELECT = `
  SELECT
    id,
    timestamp,
    "promptVersionHash" AS prompt_version_hash,
    "nodeId" AS node_id,
    "qualityScore" AS quality_score,
    "downstreamImpact" AS downstream_impact,
    "costUSD" AS cost_usd,
    "latencyMs" AS latency_ms,
    "inputTokens" AS input_tokens,
    "outputTokens" AS output_tokens,
    "experimentId" AS experiment_id,
    "variantId" AS variant_id,
    metadata,
    "tenantId" AS tenant_id
  FROM "PromptPerformanceLog"
`;

function getOptionalTenantId(operationName: string): string | null {
  const { tenantId } = getTenantRuntimeContextFromStore();

  if (!tenantId) {
    return null;
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

function getRequiredTenantId(operationName: string, tenantIdOverride?: string | null): string {
  const tenantId = tenantIdOverride ?? getTenantRuntimeContextFromStore().tenantId;

  if (!tenantId) {
    throw new Error(`Tenant context required for ${operationName}: missing tenant context`);
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

function requireFirstRow<T>(rows: T[], operationName: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`${operationName} returned no rows`);
  }

  return row;
}

function appendTenantScope(
  query: string,
  params: unknown[],
  operationName: string
): { query: string; params: unknown[]; requireTenant: boolean } {
  const tenantId = getOptionalTenantId(operationName);

  if (!tenantId) {
    return { query, params, requireTenant: false };
  }

  return {
    query: `${query} AND "tenantId" = $${params.length + 1}`,
    params: [...params, tenantId],
    requireTenant: true,
  };
}

/**
 * Log a prompt performance entry (append-only)
 * Validates: Requirements 1.1, 10.2
 */
export async function logPerformance(
  log: Omit<PromptPerformanceLog, 'id' | 'timestamp'>
): Promise<PromptPerformanceLog> {
  const tenantId = getRequiredTenantId('PromptPerformanceLog.create', log.tenantId);
  const query = `
    INSERT INTO "PromptPerformanceLog" (
      "promptVersionHash",
      "nodeId",
      "qualityScore",
      "downstreamImpact",
      "costUSD",
      "latencyMs",
      "inputTokens",
      "outputTokens",
      "experimentId",
      "variantId",
      metadata,
      "tenantId"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::uuid, $11, $12)
    RETURNING
      id,
      timestamp,
      "promptVersionHash" AS prompt_version_hash,
      "nodeId" AS node_id,
      "qualityScore" AS quality_score,
      "downstreamImpact" AS downstream_impact,
      "costUSD" AS cost_usd,
      "latencyMs" AS latency_ms,
      "inputTokens" AS input_tokens,
      "outputTokens" AS output_tokens,
      "experimentId" AS experiment_id,
      "variantId" AS variant_id,
      metadata,
      "tenantId" AS tenant_id
  `;

  const params = [
    log.promptVersionHash,
    log.nodeId,
    log.qualityScore,
    log.downstreamImpact,
    log.costUSD,
    log.latencyMs,
    log.inputTokens,
    log.outputTokens,
    log.experimentId || null,
    log.variantId || null,
    log.metadata || {},
    tenantId,
  ];

  const rows = await executeQuery<PromptPerformanceLogRow>(query, params, {
    operationName: 'PromptPerformanceLog.create',
    requireTenant: true,
    tenantIdOverride: tenantId,
  });
  return mapRowToLog(requireFirstRow(rows, 'PromptPerformanceLog.create'));
}

/**
 * Get performance logs by version hash with optional time range
 * Validates: Requirements 1.3
 */
export async function getPerformanceByVersion(
  versionHash: string,
  timeRange?: TimeRange
): Promise<PromptPerformanceLog[]> {
  let query = `
    ${PROMPT_PERFORMANCE_SELECT}
    WHERE "promptVersionHash" = $1
  `;
  const params: unknown[] = [versionHash];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  const scoped = appendTenantScope(query, params, 'PromptPerformanceLog.getByVersion');
  scoped.query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(scoped.query, scoped.params, {
    operationName: 'PromptPerformanceLog.getByVersion',
    requireTenant: scoped.requireTenant,
  });
  return rows.map(mapRowToLog);
}

/**
 * Get performance logs by node ID
 */
export async function getPerformanceByNode(
  nodeId: string,
  timeRange?: TimeRange
): Promise<PromptPerformanceLog[]> {
  let query = `
    ${PROMPT_PERFORMANCE_SELECT}
    WHERE "nodeId" = $1
  `;
  const params: unknown[] = [nodeId];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  const scoped = appendTenantScope(query, params, 'PromptPerformanceLog.getByNode');
  scoped.query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(scoped.query, scoped.params, {
    operationName: 'PromptPerformanceLog.getByNode',
    requireTenant: scoped.requireTenant,
  });
  return rows.map(mapRowToLog);
}

/**
 * Get performance logs by experiment ID
 */
export async function getPerformanceByExperiment(
  experimentId: string
): Promise<PromptPerformanceLog[]> {
  const base = appendTenantScope(
    `
    ${PROMPT_PERFORMANCE_SELECT}
    WHERE "experimentId" = $1
  `,
    [experimentId],
    'PromptPerformanceLog.getByExperiment'
  );
  base.query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(base.query, base.params, {
    operationName: 'PromptPerformanceLog.getByExperiment',
    requireTenant: base.requireTenant,
  });
  return rows.map(mapRowToLog);
}

/**
 * Get performance logs filtered by quality score threshold
 * Validates: Requirements 1.3
 */
export async function getPerformanceByQualityThreshold(
  threshold: number,
  operator: '>=' | '<=' | '>' | '<' = '>=',
  timeRange?: TimeRange
): Promise<PromptPerformanceLog[]> {
  let query = `
    ${PROMPT_PERFORMANCE_SELECT}
    WHERE "qualityScore" ${operator} $1
  `;
  const params: unknown[] = [threshold];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  const scoped = appendTenantScope(query, params, 'PromptPerformanceLog.getByQualityThreshold');
  scoped.query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(scoped.query, scoped.params, {
    operationName: 'PromptPerformanceLog.getByQualityThreshold',
    requireTenant: scoped.requireTenant,
  });
  return rows.map(mapRowToLog);
}

/**
 * Calculate aggregate metrics for a prompt version
 * Validates: Requirements 1.4
 */
export async function getAggregateMetrics(
  versionHash: string,
  timeRange?: TimeRange
): Promise<AggregateMetrics> {
  let query = `
    SELECT
      AVG("qualityScore") as avg_quality_score,
      AVG("downstreamImpact") as avg_downstream_impact,
      AVG("costUSD") as avg_cost_usd,
      AVG("latencyMs") as avg_latency_ms,
      COUNT(*) as total_calls,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") as p50_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") as p95_latency,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") as p99_latency
    FROM "PromptPerformanceLog"
    WHERE "promptVersionHash" = $1
  `;
  const params: unknown[] = [versionHash];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  const scoped = appendTenantScope(query, params, 'PromptPerformanceLog.getAggregateMetrics');
  const rows = await executeQuery<{
    avg_quality_score: string | null;
    avg_downstream_impact: string | null;
    avg_cost_usd: string | null;
    avg_latency_ms: string | null;
    total_calls: string;
    p50_latency: string | null;
    p95_latency: string | null;
    p99_latency: string | null;
  }>(scoped.query, scoped.params, {
    operationName: 'PromptPerformanceLog.getAggregateMetrics',
    requireTenant: scoped.requireTenant,
  });
  const row = requireFirstRow(rows, 'PromptPerformanceLog.getAggregateMetrics');

  return {
    avgQualityScore: Number.parseFloat(row.avg_quality_score ?? '0') || 0,
    avgDownstreamImpact: Number.parseFloat(row.avg_downstream_impact ?? '0') || 0,
    avgCostUSD: Number.parseFloat(row.avg_cost_usd ?? '0') || 0,
    avgLatencyMs: Number.parseFloat(row.avg_latency_ms ?? '0') || 0,
    totalCalls: Number.parseInt(row.total_calls, 10) || 0,
    p50Latency: Number.parseFloat(row.p50_latency ?? '0') || 0,
    p95Latency: Number.parseFloat(row.p95_latency ?? '0') || 0,
    p99Latency: Number.parseFloat(row.p99_latency ?? '0') || 0,
  };
}

/**
 * Get underperforming prompts below a quality threshold
 * Validates: Requirements 3.1
 */
export async function getUnderperformingPrompts(
  threshold: number,
  minSampleSize: number = 10
): Promise<Array<{ versionHash: string; avgQualityScore: number; sampleSize: number }>> {
  const scoped = appendTenantScope(
    `
    SELECT
      "promptVersionHash" as version_hash,
      AVG("qualityScore") as avg_quality_score,
      COUNT(*) as sample_size
    FROM "PromptPerformanceLog"
    WHERE TRUE
  `,
    [],
    'PromptPerformanceLog.getUnderperformingPrompts'
  );
  scoped.query += `
    GROUP BY "promptVersionHash"
    HAVING COUNT(*) >= $${scoped.params.length + 1} AND AVG("qualityScore") < $${scoped.params.length + 2}
    ORDER BY avg_quality_score ASC
  `;

  const rows = await executeQuery<{
    version_hash: string;
    avg_quality_score: string;
    sample_size: string;
  }>(scoped.query, [...scoped.params, minSampleSize, threshold], {
    operationName: 'PromptPerformanceLog.getUnderperformingPrompts',
    requireTenant: scoped.requireTenant,
  });
  return rows.map((row) => ({
    versionHash: row.version_hash,
    avgQualityScore: Number.parseFloat(row.avg_quality_score),
    sampleSize: Number.parseInt(row.sample_size, 10),
  }));
}

/**
 * Get total log count (for testing append-only property)
 */
export async function getTotalLogCount(): Promise<number> {
  const scoped = appendTenantScope(
    `SELECT COUNT(*) as count FROM "PromptPerformanceLog" WHERE TRUE`,
    [],
    'PromptPerformanceLog.getTotalLogCount'
  );
  const rows = await executeQuery<{ count: string }>(scoped.query, scoped.params, {
    operationName: 'PromptPerformanceLog.getTotalLogCount',
    requireTenant: scoped.requireTenant,
  });
  return Number.parseInt(requireFirstRow(rows, 'PromptPerformanceLog.getTotalLogCount').count, 10);
}

/**
 * Map database row to domain object
 */
function mapRowToLog(row: PromptPerformanceLogRow): PromptPerformanceLog {
  return {
    id: row.id,
    timestamp: row.timestamp,
    promptVersionHash: row.prompt_version_hash,
    nodeId: row.node_id,
    qualityScore: Number.parseFloat(row.quality_score.toString()),
    downstreamImpact: Number.parseFloat(row.downstream_impact.toString()),
    costUSD: Number.parseFloat(row.cost_usd.toString()),
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    experimentId: row.experiment_id || undefined,
    variantId: row.variant_id || undefined,
    metadata: row.metadata || {},
    tenantId: row.tenant_id,
  };
}
