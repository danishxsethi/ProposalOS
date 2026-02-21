/**
 * Property-Based Tests for PromptPerformanceTracker
 * Feature: self-evolving-prompts-predictive-intelligence
 * 
 * Tests correctness properties:
 * - Property 1: Performance Log Completeness
 * - Property 2: Append-Only Log Integrity
 * - Property 3: Query Filter Correctness
 * - Property 4: Aggregate Metric Accuracy
 * - Property 5: Quality Score Comparability
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { PromptPerformanceTracker } from '../PromptPerformanceTracker';
import { prisma } from '../db';
import { getTotalLogCount } from '../data-access/prompt-performance';

describe('PromptPerformanceTracker Property-Based Tests', () => {
  let tracker: PromptPerformanceTracker;

  beforeAll(async () => {
    await prisma.$connect();
    tracker = new PromptPerformanceTracker();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE node_id LIKE 'test-prop-%'`;
    await prisma.$disconnect();
  });

  /**
   * Property 1: Performance Log Completeness
   * 
   * **Validates: Requirements 1.1, 10.2**
   * 
   * For any LLM call, when logged by the Prompt_Performance_Tracker, the stored record
   * SHALL contain all required fields: version hash, quality score, downstream impact,
   * cost, latency, input tokens, and output tokens.
   */
  it('Property 1: should store complete performance logs with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          promptVersionHash: fc.string({ minLength: 10, maxLength: 64 }),
          nodeId: fc.string({ minLength: 5, maxLength: 50 }).map(s => `test-prop-${s}`),
          qualityScore: fc.double({ min: 0, max: 100, noNaN: true }),
          downstreamImpact: fc.double({ min: 0, max: 100, noNaN: true }),
          costUSD: fc.double({ min: 0.0001, max: 1, noNaN: true }),
          latencyMs: fc.integer({ min: 100, max: 10000 }),
          inputTokens: fc.integer({ min: 1, max: 10000 }),
          outputTokens: fc.integer({ min: 1, max: 5000 }),
          metadata: fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
        }),
        async (logData) => {
          const log = await tracker.logPerformance(logData);

          // Verify all required fields are present and match input
          expect(log.id).toBeTruthy();
          expect(log.timestamp).toBeInstanceOf(Date);
          expect(log.promptVersionHash).toBe(logData.promptVersionHash);
          expect(log.nodeId).toBe(logData.nodeId);
          expect(log.qualityScore).toBeCloseTo(logData.qualityScore, 2);
          expect(log.downstreamImpact).toBeCloseTo(logData.downstreamImpact, 2);
          expect(log.costUSD).toBeCloseTo(logData.costUSD, 6);
          expect(log.latencyMs).toBe(logData.latencyMs);
          expect(log.inputTokens).toBe(logData.inputTokens);
          expect(log.outputTokens).toBe(logData.outputTokens);
          expect(log.metadata).toEqual(logData.metadata);

          // Clean up
          await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE id = ${log.id}::uuid`;
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  });

  /**
   * Property 2: Append-Only Log Integrity
   * 
   * **Validates: Requirements 1.2, 10.1**
   * 
   * For any performance log record, once written to PostgreSQL, the record SHALL never
   * be modified or deleted, and the total record count SHALL only increase over time.
   */
  it('Property 2: should maintain append-only log integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            promptVersionHash: fc.string({ minLength: 10, maxLength: 64 }),
            nodeId: fc.constant('test-prop-append-only'),
            qualityScore: fc.double({ min: 0, max: 100, noNaN: true }),
            downstreamImpact: fc.double({ min: 0, max: 100, noNaN: true }),
            costUSD: fc.double({ min: 0.0001, max: 1, noNaN: true }),
            latencyMs: fc.integer({ min: 100, max: 10000 }),
            inputTokens: fc.integer({ min: 1, max: 10000 }),
            outputTokens: fc.integer({ min: 1, max: 5000 }),
            metadata: fc.constant({}),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (logsData) => {
          const initialCount = await getTotalLogCount();
          const createdIds: string[] = [];

          try {
            // Log all entries
            for (const logData of logsData) {
              const log = await tracker.logPerformance(logData);
              createdIds.push(log.id);
            }

            // Verify count increased by exactly the number of logs
            const afterCount = await getTotalLogCount();
            expect(afterCount).toBe(initialCount + logsData.length);

            // Verify all logs still exist (not deleted)
            for (const id of createdIds) {
              const logs = await prisma.$queryRaw<any[]>`
                SELECT * FROM prompt_performance_logs WHERE id = ${id}::uuid
              `;
              expect(logs.length).toBe(1);
            }

          } finally {
            // Clean up
            for (const id of createdIds) {
              await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE id = ${id}::uuid`;
            }
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property 3: Query Filter Correctness
   * 
   * **Validates: Requirements 1.3**
   * 
   * For any query with filters (version hash, time range, or quality score threshold),
   * all returned performance logs SHALL match the specified filter criteria.
   */
  it('Property 3: should return only logs matching filter criteria', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          versionHash: fc.string({ minLength: 10, maxLength: 64 }),
          nodeId: fc.constant('test-prop-filter'),
          logs: fc.array(
            fc.record({
              qualityScore: fc.double({ min: 0, max: 100, noNaN: true }),
              downstreamImpact: fc.double({ min: 0, max: 100, noNaN: true }),
              costUSD: fc.double({ min: 0.0001, max: 1, noNaN: true }),
              latencyMs: fc.integer({ min: 100, max: 10000 }),
              inputTokens: fc.integer({ min: 1, max: 10000 }),
              outputTokens: fc.integer({ min: 1, max: 5000 }),
            }),
            { minLength: 5, maxLength: 15 }
          ),
          threshold: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        async ({ versionHash, nodeId, logs, threshold }) => {
          const createdIds: string[] = [];

          try {
            // Create logs
            for (const logData of logs) {
              const log = await tracker.logPerformance({
                promptVersionHash: versionHash,
                nodeId,
                ...logData,
                metadata: {},
              });
              createdIds.push(log.id);
            }

            // Test version hash filter
            const versionLogs = await tracker.getPerformanceByVersion(versionHash);
            expect(versionLogs.every(log => log.promptVersionHash === versionHash)).toBe(true);

            // Test quality threshold filter (>=)
            const highQualityLogs = await tracker.getPerformanceByQualityThreshold(threshold, '>=');
            const relevantHighQuality = highQualityLogs.filter(log => createdIds.includes(log.id));
            expect(relevantHighQuality.every(log => log.qualityScore >= threshold)).toBe(true);

            // Test quality threshold filter (<)
            const lowQualityLogs = await tracker.getPerformanceByQualityThreshold(threshold, '<');
            const relevantLowQuality = lowQualityLogs.filter(log => createdIds.includes(log.id));
            expect(relevantLowQuality.every(log => log.qualityScore < threshold)).toBe(true);

            // Test time range filter
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const timeRangeLogs = await tracker.getPerformanceByVersion(versionHash, {
              start: oneHourAgo,
              end: now,
            });
            expect(timeRangeLogs.every(log => 
              log.timestamp >= oneHourAgo && log.timestamp <= now
            )).toBe(true);

          } finally {
            // Clean up
            for (const id of createdIds) {
              await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE id = ${id}::uuid`;
            }
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property 4: Aggregate Metric Accuracy
   * 
   * **Validates: Requirements 1.4**
   * 
   * For any set of performance logs for a given prompt version, the calculated aggregate
   * metrics (average quality score, average cost, average latency, percentiles) SHALL
   * match the values computed directly from the raw logs.
   */
  it('Property 4: should calculate accurate aggregate metrics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          versionHash: fc.string({ minLength: 10, maxLength: 64 }),
          nodeId: fc.constant('test-prop-aggregate'),
          logs: fc.array(
            fc.record({
              qualityScore: fc.double({ min: 0, max: 100, noNaN: true }),
              downstreamImpact: fc.double({ min: 0, max: 100, noNaN: true }),
              costUSD: fc.double({ min: 0.0001, max: 1, noNaN: true }),
              latencyMs: fc.integer({ min: 100, max: 10000 }),
              inputTokens: fc.integer({ min: 1, max: 10000 }),
              outputTokens: fc.integer({ min: 1, max: 5000 }),
            }),
            { minLength: 10, maxLength: 20 }
          ),
        }),
        async ({ versionHash, nodeId, logs }) => {
          const createdIds: string[] = [];

          try {
            // Create logs
            for (const logData of logs) {
              const log = await tracker.logPerformance({
                promptVersionHash: versionHash,
                nodeId,
                ...logData,
                metadata: {},
              });
              createdIds.push(log.id);
            }

            // Get aggregate metrics from tracker
            const metrics = await tracker.getAggregateMetrics(versionHash);

            // Calculate expected values manually
            const expectedAvgQuality = logs.reduce((sum, l) => sum + l.qualityScore, 0) / logs.length;
            const expectedAvgImpact = logs.reduce((sum, l) => sum + l.downstreamImpact, 0) / logs.length;
            const expectedAvgCost = logs.reduce((sum, l) => sum + l.costUSD, 0) / logs.length;
            const expectedAvgLatency = logs.reduce((sum, l) => sum + l.latencyMs, 0) / logs.length;

            // Verify aggregate metrics match manual calculations
            expect(metrics.totalCalls).toBe(logs.length);
            expect(metrics.avgQualityScore).toBeCloseTo(expectedAvgQuality, 1);
            expect(metrics.avgDownstreamImpact).toBeCloseTo(expectedAvgImpact, 1);
            expect(metrics.avgCostUSD).toBeCloseTo(expectedAvgCost, 5);
            expect(metrics.avgLatencyMs).toBeCloseTo(expectedAvgLatency, 1);

            // Verify percentiles are within reasonable bounds
            const sortedLatencies = logs.map(l => l.latencyMs).sort((a, b) => a - b);
            const minLatency = sortedLatencies[0];
            const maxLatency = sortedLatencies[sortedLatencies.length - 1];
            
            expect(metrics.p50Latency).toBeGreaterThanOrEqual(minLatency);
            expect(metrics.p50Latency).toBeLessThanOrEqual(maxLatency);
            expect(metrics.p95Latency).toBeGreaterThanOrEqual(metrics.p50Latency);
            expect(metrics.p99Latency).toBeGreaterThanOrEqual(metrics.p95Latency);

          } finally {
            // Clean up
            for (const id of createdIds) {
              await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE id = ${id}::uuid`;
            }
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });

  /**
   * Property 5: Quality Score Comparability
   * 
   * **Validates: Requirements 1.5**
   * 
   * For any two quality scores from different prompt versions, the scores SHALL be
   * numeric values that support comparison operations (greater than, less than, equal to).
   */
  it('Property 5: should support quality score comparisons', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          version1: fc.string({ minLength: 10, maxLength: 64 }),
          version2: fc.string({ minLength: 10, maxLength: 64 }),
          nodeId: fc.constant('test-prop-compare'),
          score1: fc.double({ min: 0, max: 100, noNaN: true }),
          score2: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        async ({ version1, version2, nodeId, score1, score2 }) => {
          const createdIds: string[] = [];

          try {
            // Create logs with different quality scores
            const log1 = await tracker.logPerformance({
              promptVersionHash: version1,
              nodeId,
              qualityScore: score1,
              downstreamImpact: 80,
              costUSD: 0.002,
              latencyMs: 1000,
              inputTokens: 400,
              outputTokens: 150,
              metadata: {},
            });

            const log2 = await tracker.logPerformance({
              promptVersionHash: version2,
              nodeId,
              qualityScore: score2,
              downstreamImpact: 80,
              costUSD: 0.002,
              latencyMs: 1000,
              inputTokens: 400,
              outputTokens: 150,
              metadata: {},
            });

            createdIds.push(log1.id, log2.id);

            // Verify quality scores are numeric and comparable
            expect(typeof log1.qualityScore).toBe('number');
            expect(typeof log2.qualityScore).toBe('number');
            expect(isNaN(log1.qualityScore)).toBe(false);
            expect(isNaN(log2.qualityScore)).toBe(false);

            // Verify comparison operations work correctly
            // Use a small tolerance for floating point comparison
            const tolerance = 0.01;
            if (Math.abs(score1 - score2) < tolerance) {
              // Scores are effectively equal
              expect(log1.qualityScore).toBeCloseTo(log2.qualityScore, 2);
            } else if (score1 > score2) {
              expect(log1.qualityScore).toBeGreaterThan(log2.qualityScore);
            } else {
              expect(log1.qualityScore).toBeLessThan(log2.qualityScore);
            }

          } finally {
            // Clean up
            for (const id of createdIds) {
              await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE id = ${id}::uuid`;
            }
          }
        }
      ),
      { numRuns: 50, timeout: 30000 }
    );
  });
});
