/**
 * Data Access Layer for Prompt Performance Logs
 * Implements CRUD operations and aggregate queries
 */

import { prisma, executeQuery, executeCommand } from '../db';
import {
  PromptPerformanceLog,
  PromptPerformanceLogRow,
  AggregateMetrics,
  TimeRange,
} from '../types';

/**
 * Log a prompt performance entry (append-only)
 * Validates: Requirements 1.1, 10.2
 */
export async function logPerformance(
  log: Omit<PromptPerformanceLog, 'id' | 'timestamp'>
): Promise<PromptPerformanceLog> {
  const query = `
    INSERT INTO prompt_performance_logs (
      prompt_version_hash,
      node_id,
      quality_score,
      downstream_impact,
      cost_usd,
      latency_ms,
      input_tokens,
      output_tokens,
      experiment_id,
      variant_id,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::uuid, $11)
    RETURNING *
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
  ];

  const rows = await executeQuery<PromptPerformanceLogRow>(query, params);
  return mapRowToLog(rows[0]);
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
    SELECT * FROM prompt_performance_logs
    WHERE prompt_version_hash = $1
  `;
  const params: any[] = [versionHash];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(query, params);
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
    SELECT * FROM prompt_performance_logs
    WHERE node_id = $1
  `;
  const params: any[] = [nodeId];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(query, params);
  return rows.map(mapRowToLog);
}

/**
 * Get performance logs by experiment ID
 */
export async function getPerformanceByExperiment(
  experimentId: string
): Promise<PromptPerformanceLog[]> {
  const query = `
    SELECT * FROM prompt_performance_logs
    WHERE experiment_id = $1
    ORDER BY timestamp DESC
  `;

  const rows = await executeQuery<PromptPerformanceLogRow>(query, [experimentId]);
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
    SELECT * FROM prompt_performance_logs
    WHERE quality_score ${operator} $1
  `;
  const params: any[] = [threshold];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  query += ` ORDER BY timestamp DESC`;

  const rows = await executeQuery<PromptPerformanceLogRow>(query, params);
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
      AVG(quality_score) as avg_quality_score,
      AVG(downstream_impact) as avg_downstream_impact,
      AVG(cost_usd) as avg_cost_usd,
      AVG(latency_ms) as avg_latency_ms,
      COUNT(*) as total_calls,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency
    FROM prompt_performance_logs
    WHERE prompt_version_hash = $1
  `;
  const params: any[] = [versionHash];

  if (timeRange) {
    query += ` AND timestamp >= $2 AND timestamp <= $3`;
    params.push(timeRange.start, timeRange.end);
  }

  const rows = await executeQuery<any>(query, params);
  const row = rows[0];

  return {
    avgQualityScore: parseFloat(row.avg_quality_score) || 0,
    avgDownstreamImpact: parseFloat(row.avg_downstream_impact) || 0,
    avgCostUSD: parseFloat(row.avg_cost_usd) || 0,
    avgLatencyMs: parseFloat(row.avg_latency_ms) || 0,
    totalCalls: parseInt(row.total_calls) || 0,
    p50Latency: parseFloat(row.p50_latency) || 0,
    p95Latency: parseFloat(row.p95_latency) || 0,
    p99Latency: parseFloat(row.p99_latency) || 0,
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
  const query = `
    SELECT
      prompt_version_hash as version_hash,
      AVG(quality_score) as avg_quality_score,
      COUNT(*) as sample_size
    FROM prompt_performance_logs
    GROUP BY prompt_version_hash
    HAVING COUNT(*) >= $1 AND AVG(quality_score) < $2
    ORDER BY avg_quality_score ASC
  `;

  const rows = await executeQuery<any>(query, [minSampleSize, threshold]);
  return rows.map(row => ({
    versionHash: row.version_hash,
    avgQualityScore: parseFloat(row.avg_quality_score),
    sampleSize: parseInt(row.sample_size),
  }));
}

/**
 * Get total log count (for testing append-only property)
 */
export async function getTotalLogCount(): Promise<number> {
  const query = `SELECT COUNT(*) as count FROM prompt_performance_logs`;
  const rows = await executeQuery<{ count: string }>(query);
  return parseInt(rows[0].count);
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
    qualityScore: parseFloat(row.quality_score.toString()),
    downstreamImpact: parseFloat(row.downstream_impact.toString()),
    costUSD: parseFloat(row.cost_usd.toString()),
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    experimentId: row.experiment_id || undefined,
    variantId: row.variant_id || undefined,
    metadata: row.metadata || {},
  };
}
