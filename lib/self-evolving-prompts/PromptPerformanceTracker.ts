/**
 * PromptPerformanceTracker Class
 * Provides a high-level interface for tracking LLM prompt performance
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import {
  PromptPerformanceLog,
  AggregateMetrics,
  TimeRange,
  PromptVersion,
} from './types';
import * as promptPerformanceDA from './data-access/prompt-performance';

export class PromptPerformanceTracker {
  /**
   * Log a prompt performance entry (append-only)
   * 
   * Implements append-only logging to PostgreSQL with:
   * - Automatic timestamp generation (handled by database DEFAULT NOW())
   * - Automatic UUID generation (handled by database gen_random_uuid())
   * - Metadata serialization to JSONB (handled by database JSONB type)
   * 
   * Validates: Requirements 1.1, 1.2, 10.2
   * 
   * @param log - Performance log data (without id and timestamp)
   * @returns Promise resolving to the created log entry with id and timestamp
   */
  async logPerformance(
    log: Omit<PromptPerformanceLog, 'id' | 'timestamp'>
  ): Promise<PromptPerformanceLog> {
    // Validate required fields
    this.validateLogEntry(log);

    // Delegate to data access layer which handles:
    // - UUID generation via database DEFAULT gen_random_uuid()
    // - Timestamp generation via database DEFAULT NOW()
    // - JSONB serialization for metadata
    // - Append-only INSERT operation
    return promptPerformanceDA.logPerformance(log);
  }

  /**
   * Get performance logs by version hash with optional time range filtering
   * 
   * Validates: Requirements 1.3
   * 
   * @param versionHash - Prompt version hash to filter by
   * @param timeRange - Optional time range filter
   * @returns Promise resolving to array of performance logs
   */
  async getPerformanceByVersion(
    versionHash: string,
    timeRange?: TimeRange
  ): Promise<PromptPerformanceLog[]> {
    return promptPerformanceDA.getPerformanceByVersion(versionHash, timeRange);
  }

  /**
   * Calculate aggregate metrics for a prompt version
   * 
   * Validates: Requirements 1.4
   * 
   * @param versionHash - Prompt version hash to calculate metrics for
   * @param timeRange - Optional time range filter
   * @returns Promise resolving to aggregate metrics
   */
  async getAggregateMetrics(
    versionHash: string,
    timeRange?: TimeRange
  ): Promise<AggregateMetrics> {
    return promptPerformanceDA.getAggregateMetrics(versionHash, timeRange);
  }

  /**
   * Get underperforming prompts below a quality threshold
   * 
   * Validates: Requirements 3.1
   * 
   * @param threshold - Quality score threshold
   * @param minSampleSize - Minimum number of samples required (default: 10)
   * @returns Promise resolving to array of underperforming prompt versions
   */
  async getUnderperformingPrompts(
    threshold: number,
    minSampleSize: number = 10
  ): Promise<Array<{ versionHash: string; avgQualityScore: number; sampleSize: number }>> {
    return promptPerformanceDA.getUnderperformingPrompts(threshold, minSampleSize);
  }

  /**
   * Get performance logs by node ID
   * 
   * @param nodeId - LangGraph node ID to filter by
   * @param timeRange - Optional time range filter
   * @returns Promise resolving to array of performance logs
   */
  async getPerformanceByNode(
    nodeId: string,
    timeRange?: TimeRange
  ): Promise<PromptPerformanceLog[]> {
    return promptPerformanceDA.getPerformanceByNode(nodeId, timeRange);
  }

  /**
   * Get performance logs by experiment ID
   * 
   * @param experimentId - A/B experiment ID to filter by
   * @returns Promise resolving to array of performance logs
   */
  async getPerformanceByExperiment(
    experimentId: string
  ): Promise<PromptPerformanceLog[]> {
    return promptPerformanceDA.getPerformanceByExperiment(experimentId);
  }

  /**
   * Get performance logs filtered by quality score threshold
   * 
   * Validates: Requirements 1.3, 1.5
   * 
   * @param threshold - Quality score threshold
   * @param operator - Comparison operator (default: '>=')
   * @param timeRange - Optional time range filter
   * @returns Promise resolving to array of performance logs
   */
  async getPerformanceByQualityThreshold(
    threshold: number,
    operator: '>=' | '<=' | '>' | '<' = '>=',
    timeRange?: TimeRange
  ): Promise<PromptPerformanceLog[]> {
    return promptPerformanceDA.getPerformanceByQualityThreshold(
      threshold,
      operator,
      timeRange
    );
  }

  /**
   * Validate log entry has all required fields
   * 
   * @param log - Log entry to validate
   * @throws Error if validation fails
   */
  private validateLogEntry(log: Omit<PromptPerformanceLog, 'id' | 'timestamp'>): void {
    const requiredFields = [
      'promptVersionHash',
      'nodeId',
      'qualityScore',
      'downstreamImpact',
      'costUSD',
      'latencyMs',
      'inputTokens',
      'outputTokens',
    ];

    for (const field of requiredFields) {
      if (log[field as keyof typeof log] === undefined || log[field as keyof typeof log] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate numeric fields are actually numbers
    const numericFields = [
      'qualityScore',
      'downstreamImpact',
      'costUSD',
      'latencyMs',
      'inputTokens',
      'outputTokens',
    ];

    for (const field of numericFields) {
      const value = log[field as keyof typeof log];
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`Field ${field} must be a valid number`);
      }
    }

    // Validate quality score is comparable (numeric)
    // Validates: Requirements 1.5
    if (typeof log.qualityScore !== 'number') {
      throw new Error('Quality score must be a numeric value for comparison');
    }
  }
}
