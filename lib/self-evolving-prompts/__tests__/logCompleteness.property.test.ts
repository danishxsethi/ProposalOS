/**
 * Feature: self-evolving-prompts-predictive-intelligence
 * Property 1: Performance Log Completeness
 * 
 * Validates: Requirements 1.1, 10.2
 * 
 * Property: For any LLM call, when logged by the Prompt_Performance_Tracker,
 * the stored record contains all required fields: version hash, quality score,
 * downstream impact, cost, latency, input tokens, and output tokens.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { PromptPerformanceTracker } from '../PromptPerformanceTracker';
import * as promptPerformanceDA from '../data-access/prompt-performance';
import { PromptPerformanceLog } from '../types';
import { closeConnection } from '../db';

describe('Property 1: Performance Log Completeness', () => {
  const tracker = new PromptPerformanceTracker();

  // Define generators for required fields
  const versionHashArb = fc.string({ minLength: 64, maxLength: 64 });
  const nodeIdArb = fc.string({ minLength: 1, maxLength: 255 });
  // Use reasonable ranges for quality scores (0-100)
  const qualityScoreArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });
  const downstreamImpactArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });
  // Cost in USD with reasonable precision
  const costArb = fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true });
  const latencyArb = fc.integer({ min: 1, max: 10000 });
  const tokensArb = fc.integer({ min: 1, max: 100000 });
  const metadataArb = fc.record({
    source: fc.string(),
    experimentName: fc.option(fc.string()),
  });

  afterAll(async () => {
    await closeConnection();
  });

  it('should log all required fields for any valid performance log', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionHashArb,
        nodeIdArb,
        qualityScoreArb,
        downstreamImpactArb,
        costArb,
        latencyArb,
        tokensArb,
        tokensArb,
        metadataArb,
        async (
          versionHash,
          nodeId,
          qualityScore,
          downstreamImpact,
          cost,
          latency,
          inputTokens,
          outputTokens,
          metadata
        ) => {
          // Arrange: Create a performance log entry
          const logEntry = {
            promptVersionHash: versionHash,
            nodeId,
            qualityScore,
            downstreamImpact,
            costUSD: cost,
            latencyMs: latency,
            inputTokens,
            outputTokens,
            metadata,
          };

          // Act: Log the performance
          const result = await tracker.logPerformance(logEntry);

          // Assert: Verify all required fields are present in the stored record
          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
          expect(typeof result.id).toBe('string');
          expect(result.id.length).toBeGreaterThan(0);

          expect(result.timestamp).toBeDefined();
          expect(result.timestamp instanceof Date).toBe(true);

          expect(result.promptVersionHash).toBe(versionHash);
          expect(result.nodeId).toBe(nodeId);
          // Allow for floating point precision loss
          expect(Math.abs(result.qualityScore - qualityScore)).toBeLessThan(0.01);
          expect(Math.abs(result.downstreamImpact - downstreamImpact)).toBeLessThan(0.01);
          expect(Math.abs(result.costUSD - cost)).toBeLessThan(0.01);
          expect(result.latencyMs).toBe(latency);
          expect(result.inputTokens).toBe(inputTokens);
          expect(result.outputTokens).toBe(outputTokens);
          expect(result.metadata).toEqual(metadata);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should store all required fields in database for any valid performance log', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionHashArb,
        nodeIdArb,
        qualityScoreArb,
        downstreamImpactArb,
        costArb,
        latencyArb,
        tokensArb,
        tokensArb,
        metadataArb,
        async (
          versionHash,
          nodeId,
          qualityScore,
          downstreamImpact,
          cost,
          latency,
          inputTokens,
          outputTokens,
          metadata
        ) => {
          // Arrange: Create a performance log entry
          const logEntry = {
            promptVersionHash: versionHash,
            nodeId,
            qualityScore,
            downstreamImpact,
            costUSD: cost,
            latencyMs: latency,
            inputTokens,
            outputTokens,
            metadata,
          };

          // Act: Log the performance
          const result = await tracker.logPerformance(logEntry);

          // Assert: Retrieve from database and verify all fields are persisted
          const retrieved = await promptPerformanceDA.getPerformanceByVersion(versionHash);
          expect(retrieved.length).toBeGreaterThan(0);

          const storedLog = retrieved.find((log) => log.id === result.id);
          expect(storedLog).toBeDefined();

          if (storedLog) {
            // Verify all required fields are present and correct
            expect(storedLog.promptVersionHash).toBe(versionHash);
            expect(storedLog.nodeId).toBe(nodeId);
            // Allow for floating point precision loss
            expect(Math.abs(storedLog.qualityScore - qualityScore)).toBeLessThan(0.01);
            expect(Math.abs(storedLog.downstreamImpact - downstreamImpact)).toBeLessThan(0.01);
            expect(Math.abs(storedLog.costUSD - cost)).toBeLessThan(0.01);
            expect(storedLog.latencyMs).toBe(latency);
            expect(storedLog.inputTokens).toBe(inputTokens);
            expect(storedLog.outputTokens).toBe(outputTokens);
            expect(storedLog.metadata).toEqual(metadata);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have numeric quality score for any valid performance log', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionHashArb,
        nodeIdArb,
        qualityScoreArb,
        downstreamImpactArb,
        costArb,
        latencyArb,
        tokensArb,
        tokensArb,
        async (
          versionHash,
          nodeId,
          qualityScore,
          downstreamImpact,
          cost,
          latency,
          inputTokens,
          outputTokens
        ) => {
          // Arrange: Create a performance log entry
          const logEntry = {
            promptVersionHash: versionHash,
            nodeId,
            qualityScore,
            downstreamImpact,
            costUSD: cost,
            latencyMs: latency,
            inputTokens,
            outputTokens,
            metadata: {},
          };

          // Act: Log the performance
          const result = await tracker.logPerformance(logEntry);

          // Assert: Quality score is numeric and comparable
          expect(typeof result.qualityScore).toBe('number');
          expect(isNaN(result.qualityScore)).toBe(false);

          // Verify quality score supports comparison operations
          expect(result.qualityScore).toBeGreaterThan(0);
          expect(result.qualityScore).toBeLessThanOrEqual(100);
          // Allow for floating point precision loss
          expect(Math.abs(result.qualityScore - qualityScore)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have all numeric fields for any valid performance log', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionHashArb,
        nodeIdArb,
        qualityScoreArb,
        downstreamImpactArb,
        costArb,
        latencyArb,
        tokensArb,
        tokensArb,
        async (
          versionHash,
          nodeId,
          qualityScore,
          downstreamImpact,
          cost,
          latency,
          inputTokens,
          outputTokens
        ) => {
          // Arrange: Create a performance log entry
          const logEntry = {
            promptVersionHash: versionHash,
            nodeId,
            qualityScore,
            downstreamImpact,
            costUSD: cost,
            latencyMs: latency,
            inputTokens,
            outputTokens,
            metadata: {},
          };

          // Act: Log the performance
          const result = await tracker.logPerformance(logEntry);

          // Assert: All numeric fields are valid numbers
          const numericFields = [
            'qualityScore',
            'downstreamImpact',
            'costUSD',
            'latencyMs',
            'inputTokens',
            'outputTokens',
          ];

          for (const field of numericFields) {
            const value = result[field as keyof PromptPerformanceLog];
            expect(typeof value).toBe('number');
            expect(isNaN(value as number)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have non-empty string fields for any valid performance log', async () => {
    await fc.assert(
      fc.asyncProperty(
        versionHashArb,
        nodeIdArb,
        qualityScoreArb,
        downstreamImpactArb,
        costArb,
        latencyArb,
        tokensArb,
        tokensArb,
        async (
          versionHash,
          nodeId,
          qualityScore,
          downstreamImpact,
          cost,
          latency,
          inputTokens,
          outputTokens
        ) => {
          // Arrange: Create a performance log entry
          const logEntry = {
            promptVersionHash: versionHash,
            nodeId,
            qualityScore,
            downstreamImpact,
            costUSD: cost,
            latencyMs: latency,
            inputTokens,
            outputTokens,
            metadata: {},
          };

          // Act: Log the performance
          const result = await tracker.logPerformance(logEntry);

          // Assert: All string fields are non-empty
          expect(result.promptVersionHash).toBeDefined();
          expect(result.promptVersionHash.length).toBeGreaterThan(0);

          expect(result.nodeId).toBeDefined();
          expect(result.nodeId.length).toBeGreaterThan(0);

          expect(result.id).toBeDefined();
          expect(result.id.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
