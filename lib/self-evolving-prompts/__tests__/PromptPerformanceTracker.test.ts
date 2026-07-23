/**
 * Unit Tests for PromptPerformanceTracker
 * Feature: self-evolving-prompts-predictive-intelligence
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PromptPerformanceTracker } from '../PromptPerformanceTracker';
import { prisma } from '../db';
import { PromptPerformanceLog } from '../types';

describe('PromptPerformanceTracker', () => {
  let tracker: PromptPerformanceTracker;
  const testNodeId = 'test-node-tracker';
  const testVersionHash = 'test-version-hash-123';
  const createdLogIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    tracker = new PromptPerformanceTracker();
  });

  afterAll(async () => {
    // Clean up all test data
    await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE node_id = ${testNodeId}`;
    await prisma.$disconnect();
  });

  beforeEach(() => {
    createdLogIds.length = 0;
  });

  describe('logPerformance', () => {
    it('should log performance with all required fields', async () => {
      const log = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 85.5,
        downstreamImpact: 92.3,
        costUSD: 0.0025,
        latencyMs: 1250,
        inputTokens: 500,
        outputTokens: 200,
        metadata: { test: 'data' },
      });

      createdLogIds.push(log.id);

      // Verify all fields are present
      expect(log.id).toBeTruthy();
      expect(log.timestamp).toBeInstanceOf(Date);
      expect(log.promptVersionHash).toBe(testVersionHash);
      expect(log.nodeId).toBe(testNodeId);
      expect(log.qualityScore).toBe(85.5);
      expect(log.downstreamImpact).toBe(92.3);
      expect(log.costUSD).toBe(0.0025);
      expect(log.latencyMs).toBe(1250);
      expect(log.inputTokens).toBe(500);
      expect(log.outputTokens).toBe(200);
      expect(log.metadata).toEqual({ test: 'data' });
    });

    it('should auto-generate UUID for id', async () => {
      const log1 = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 80,
        downstreamImpact: 85,
        costUSD: 0.002,
        latencyMs: 1000,
        inputTokens: 400,
        outputTokens: 150,
        metadata: {},
      });

      const log2 = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 80,
        downstreamImpact: 85,
        costUSD: 0.002,
        latencyMs: 1000,
        inputTokens: 400,
        outputTokens: 150,
        metadata: {},
      });

      createdLogIds.push(log1.id, log2.id);

      // UUIDs should be unique
      expect(log1.id).not.toBe(log2.id);
      expect(log1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should auto-generate timestamp', async () => {
      const beforeLog = new Date();
      // Add small delay to ensure timestamp is after beforeLog
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const log = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 75,
        downstreamImpact: 80,
        costUSD: 0.003,
        latencyMs: 1500,
        inputTokens: 600,
        outputTokens: 250,
        metadata: {},
      });

      createdLogIds.push(log.id);

      const afterLog = new Date();

      // Timestamp should be between before and after (with some tolerance)
      expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime() - 100);
      expect(log.timestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime() + 100);
    });

    it('should serialize metadata to JSONB', async () => {
      const complexMetadata = {
        nested: {
          object: {
            value: 123,
          },
        },
        array: [1, 2, 3],
        string: 'test',
        number: 42,
        boolean: true,
      };

      const log = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 90,
        downstreamImpact: 95,
        costUSD: 0.001,
        latencyMs: 800,
        inputTokens: 300,
        outputTokens: 100,
        metadata: complexMetadata,
      });

      createdLogIds.push(log.id);

      // Verify metadata is correctly serialized and deserialized
      expect(log.metadata).toEqual(complexMetadata);
    });

    it('should handle optional experimentId and variantId', async () => {
      const log = await tracker.logPerformance({
        promptVersionHash: testVersionHash,
        nodeId: testNodeId,
        qualityScore: 88,
        downstreamImpact: 90,
        costUSD: 0.0022,
        latencyMs: 1100,
        inputTokens: 450,
        outputTokens: 180,
        experimentId: '550e8400-e29b-41d4-a716-446655440000',
        variantId: '550e8400-e29b-41d4-a716-446655440001',
        metadata: {},
      });

      createdLogIds.push(log.id);

      expect(log.experimentId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(log.variantId).toBe('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should reject log with missing required fields', async () => {
      await expect(
        tracker.logPerformance({
          promptVersionHash: testVersionHash,
          nodeId: testNodeId,
          qualityScore: 85,
          downstreamImpact: 90,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          // Missing outputTokens
          metadata: {},
        } as any)
      ).rejects.toThrow('Missing required field: outputTokens');
    });

    it('should reject log with invalid numeric fields', async () => {
      await expect(
        tracker.logPerformance({
          promptVersionHash: testVersionHash,
          nodeId: testNodeId,
          qualityScore: 'invalid' as any,
          downstreamImpact: 90,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          outputTokens: 150,
          metadata: {},
        })
      ).rejects.toThrow('must be a valid number');
    });

    it('should validate quality score is numeric for comparability', async () => {
      await expect(
        tracker.logPerformance({
          promptVersionHash: testVersionHash,
          nodeId: testNodeId,
          qualityScore: NaN,
          downstreamImpact: 90,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          outputTokens: 150,
          metadata: {},
        })
      ).rejects.toThrow('must be a valid number');
    });
  });

  describe('getPerformanceByVersion', () => {
    beforeAll(async () => {
      // Create test logs
      const versionHash = 'test-version-query-123';
      
      for (let i = 0; i < 5; i++) {
        await tracker.logPerformance({
          promptVersionHash: versionHash,
          nodeId: testNodeId,
          qualityScore: 80 + i,
          downstreamImpact: 85 + i,
          costUSD: 0.002,
          latencyMs: 1000 + i * 100,
          inputTokens: 400,
          outputTokens: 150,
          metadata: { index: i },
        });
      }
    });

    it('should retrieve logs by version hash', async () => {
      const logs = await tracker.getPerformanceByVersion('test-version-query-123');
      
      expect(logs.length).toBe(5);
      expect(logs.every(log => log.promptVersionHash === 'test-version-query-123')).toBe(true);
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const logs = await tracker.getPerformanceByVersion('test-version-query-123', {
        start: oneHourAgo,
        end: now,
      });
      
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(log => 
        log.timestamp >= oneHourAgo && log.timestamp <= now
      )).toBe(true);
    });
  });

  describe('getAggregateMetrics', () => {
    beforeAll(async () => {
      // Create test logs with known values
      const versionHash = 'test-version-aggregate-123';
      
      await tracker.logPerformance({
        promptVersionHash: versionHash,
        nodeId: testNodeId,
        qualityScore: 80,
        downstreamImpact: 85,
        costUSD: 0.002,
        latencyMs: 1000,
        inputTokens: 400,
        outputTokens: 150,
        metadata: {},
      });

      await tracker.logPerformance({
        promptVersionHash: versionHash,
        nodeId: testNodeId,
        qualityScore: 90,
        downstreamImpact: 95,
        costUSD: 0.003,
        latencyMs: 1500,
        inputTokens: 500,
        outputTokens: 200,
        metadata: {},
      });
    });

    it('should calculate aggregate metrics correctly', async () => {
      const metrics = await tracker.getAggregateMetrics('test-version-aggregate-123');
      
      expect(metrics.totalCalls).toBe(2);
      expect(metrics.avgQualityScore).toBeCloseTo(85, 1);
      expect(metrics.avgDownstreamImpact).toBeCloseTo(90, 1);
      expect(metrics.avgCostUSD).toBeCloseTo(0.0025, 4);
      expect(metrics.avgLatencyMs).toBeCloseTo(1250, 1);
      expect(metrics.p50Latency).toBeGreaterThan(0);
      expect(metrics.p95Latency).toBeGreaterThan(0);
      expect(metrics.p99Latency).toBeGreaterThan(0);
    });
  });

  describe('getPerformanceByQualityThreshold', () => {
    beforeAll(async () => {
      // Create logs with varying quality scores
      const versionHash = 'test-version-threshold-123';
      
      for (let i = 0; i < 5; i++) {
        await tracker.logPerformance({
          promptVersionHash: versionHash,
          nodeId: testNodeId,
          qualityScore: 70 + i * 5, // 70, 75, 80, 85, 90
          downstreamImpact: 80,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          outputTokens: 150,
          metadata: {},
        });
      }
    });

    it('should filter by quality threshold with >= operator', async () => {
      const logs = await tracker.getPerformanceByQualityThreshold(80, '>=');
      
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(log => log.qualityScore >= 80)).toBe(true);
    });

    it('should filter by quality threshold with < operator', async () => {
      const logs = await tracker.getPerformanceByQualityThreshold(80, '<');
      
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(log => log.qualityScore < 80)).toBe(true);
    });
  });

  describe('getUnderperformingPrompts', () => {
    beforeAll(async () => {
      // Create underperforming prompt
      const underperformingHash = 'test-version-underperforming';
      
      for (let i = 0; i < 15; i++) {
        await tracker.logPerformance({
          promptVersionHash: underperformingHash,
          nodeId: testNodeId,
          qualityScore: 60 + Math.random() * 5, // 60-65 range
          downstreamImpact: 70,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          outputTokens: 150,
          metadata: {},
        });
      }

      // Create well-performing prompt
      const performingHash = 'test-version-performing';
      
      for (let i = 0; i < 15; i++) {
        await tracker.logPerformance({
          promptVersionHash: performingHash,
          nodeId: testNodeId,
          qualityScore: 85 + Math.random() * 5, // 85-90 range
          downstreamImpact: 90,
          costUSD: 0.002,
          latencyMs: 1000,
          inputTokens: 400,
          outputTokens: 150,
          metadata: {},
        });
      }
    });

    it('should identify underperforming prompts', async () => {
      const underperforming = await tracker.getUnderperformingPrompts(70, 10);
      
      const underperformingHashes = underperforming.map(p => p.versionHash);
      expect(underperformingHashes).toContain('test-version-underperforming');
      expect(underperformingHashes).not.toContain('test-version-performing');
      
      const underperformingPrompt = underperforming.find(
        p => p.versionHash === 'test-version-underperforming'
      );
      expect(underperformingPrompt?.avgQualityScore).toBeLessThan(70);
    });
  });
});
