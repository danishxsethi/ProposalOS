/**
 * Feature: self-evolving-prompts-predictive-intelligence
 * Property 2: Append-Only Log Integrity
 * 
 * Validates: Requirements 1.2, 10.1
 * 
 * Property: For any performance log record, once written to PostgreSQL,
 * the record SHALL never be modified or deleted, and the total record count
 * SHALL only increase over time.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import { PromptPerformanceTracker } from '../PromptPerformanceTracker';
import * as promptPerformanceDA from '../data-access/prompt-performance';
import { closeConnection } from '../db';

describe('Property 2: Append-Only Log Integrity', () => {
  const tracker = new PromptPerformanceTracker();

  // Define generators for required fields
  const versionHashArb = fc.string({ minLength: 64, maxLength: 64 });
  const nodeIdArb = fc.string({ minLength: 1, maxLength: 255 });
  const qualityScoreArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });
  const downstreamImpactArb = fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true });
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

  it('should never modify a record after it is written', async () => {
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
          const recordId = result.id;
          const originalTimestamp = result.timestamp;

          // Wait a small amount of time to ensure any potential modification would have a different timestamp
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: Retrieve the record again and verify it hasn't changed
          const retrieved = await promptPerformanceDA.getPerformanceByVersion(versionHash);
          const retrievedRecord = retrieved.find(log => log.id === recordId);

          expect(retrievedRecord).toBeDefined();
          if (retrievedRecord) {
            // Verify all fields remain unchanged
            expect(retrievedRecord.id).toBe(recordId);
            expect(retrievedRecord.timestamp).toEqual(originalTimestamp);
            expect(retrievedRecord.promptVersionHash).toBe(versionHash);
            expect(retrievedRecord.nodeId).toBe(nodeId);
            expect(Math.abs(retrievedRecord.qualityScore - qualityScore)).toBeLessThan(0.01);
            expect(Math.abs(retrievedRecord.downstreamImpact - downstreamImpact)).toBeLessThan(0.01);
            expect(Math.abs(retrievedRecord.costUSD - cost)).toBeLessThan(0.01);
            expect(retrievedRecord.latencyMs).toBe(latency);
            expect(retrievedRecord.inputTokens).toBe(inputTokens);
            expect(retrievedRecord.outputTokens).toBe(outputTokens);
            expect(retrievedRecord.metadata).toEqual(metadata);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should only increase total record count over time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            versionHash: versionHashArb,
            nodeId: nodeIdArb,
            qualityScore: qualityScoreArb,
            downstreamImpact: downstreamImpactArb,
            cost: costArb,
            latency: latencyArb,
            inputTokens: tokensArb,
            outputTokens: tokensArb,
            metadata: metadataArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (logEntries) => {
          // Arrange: Get initial count
          const initialCount = await promptPerformanceDA.getTotalLogCount();

          // Act: Log multiple performance entries
          const recordIds: string[] = [];
          for (const entry of logEntries) {
            const result = await tracker.logPerformance({
              promptVersionHash: entry.versionHash,
              nodeId: entry.nodeId,
              qualityScore: entry.qualityScore,
              downstreamImpact: entry.downstreamImpact,
              costUSD: entry.cost,
              latencyMs: entry.latency,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              metadata: entry.metadata,
            });
            recordIds.push(result.id);
          }

          // Assert: Verify count increased by exactly the number of entries added
          const finalCount = await promptPerformanceDA.getTotalLogCount();
          expect(finalCount).toBe(initialCount + logEntries.length);

          // Verify all records are retrievable
          for (const recordId of recordIds) {
            let found = false;
            for (const entry of logEntries) {
              const retrieved = await promptPerformanceDA.getPerformanceByVersion(entry.versionHash);
              if (retrieved.find(log => log.id === recordId)) {
                found = true;
                break;
              }
            }
            expect(found).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should preserve record immutability across multiple retrievals', async () => {
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
          const recordId = result.id;

          // Assert: Retrieve the record multiple times and verify consistency
          const retrievals = await Promise.all([
            promptPerformanceDA.getPerformanceByVersion(versionHash),
            promptPerformanceDA.getPerformanceByVersion(versionHash),
            promptPerformanceDA.getPerformanceByVersion(versionHash),
          ]);

          // All retrievals should contain the same record with identical data
          for (const retrieval of retrievals) {
            const record = retrieval.find(log => log.id === recordId);
            expect(record).toBeDefined();
            if (record) {
              expect(record.id).toBe(recordId);
              expect(record.timestamp).toEqual(result.timestamp);
              expect(record.promptVersionHash).toBe(versionHash);
              expect(record.nodeId).toBe(nodeId);
              expect(Math.abs(record.qualityScore - qualityScore)).toBeLessThan(0.01);
              expect(Math.abs(record.downstreamImpact - downstreamImpact)).toBeLessThan(0.01);
              expect(Math.abs(record.costUSD - cost)).toBeLessThan(0.01);
              expect(record.latencyMs).toBe(latency);
              expect(record.inputTokens).toBe(inputTokens);
              expect(record.outputTokens).toBe(outputTokens);
              expect(record.metadata).toEqual(metadata);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain record count monotonicity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            versionHash: versionHashArb,
            nodeId: nodeIdArb,
            qualityScore: qualityScoreArb,
            downstreamImpact: downstreamImpactArb,
            cost: costArb,
            latency: latencyArb,
            inputTokens: tokensArb,
            outputTokens: tokensArb,
            metadata: metadataArb,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (logEntries) => {
          // Arrange: Track counts at each step
          const counts: number[] = [];
          counts.push(await promptPerformanceDA.getTotalLogCount());

          // Act: Log entries one by one and track count after each
          for (const entry of logEntries) {
            await tracker.logPerformance({
              promptVersionHash: entry.versionHash,
              nodeId: entry.nodeId,
              qualityScore: entry.qualityScore,
              downstreamImpact: entry.downstreamImpact,
              costUSD: entry.cost,
              latencyMs: entry.latency,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              metadata: entry.metadata,
            });
            counts.push(await promptPerformanceDA.getTotalLogCount());
          }

          // Assert: Verify counts are strictly increasing
          for (let i = 1; i < counts.length; i++) {
            expect(counts[i]).toBe(counts[i - 1] + 1);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should ensure no records are deleted from the log', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            versionHash: versionHashArb,
            nodeId: nodeIdArb,
            qualityScore: qualityScoreArb,
            downstreamImpact: downstreamImpactArb,
            cost: costArb,
            latency: latencyArb,
            inputTokens: tokensArb,
            outputTokens: tokensArb,
            metadata: metadataArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (logEntries) => {
          // Arrange: Log entries and collect their IDs
          const recordIds: string[] = [];
          for (const entry of logEntries) {
            const result = await tracker.logPerformance({
              promptVersionHash: entry.versionHash,
              nodeId: entry.nodeId,
              qualityScore: entry.qualityScore,
              downstreamImpact: entry.downstreamImpact,
              costUSD: entry.cost,
              latencyMs: entry.latency,
              inputTokens: entry.inputTokens,
              outputTokens: entry.outputTokens,
              metadata: entry.metadata,
            });
            recordIds.push(result.id);
          }

          // Act: Wait a moment and then retrieve all records
          await new Promise(resolve => setTimeout(resolve, 10));

          // Assert: All records should still exist
          const allRecords: string[] = [];
          for (const entry of logEntries) {
            const retrieved = await promptPerformanceDA.getPerformanceByVersion(entry.versionHash);
            for (const record of retrieved) {
              allRecords.push(record.id);
            }
          }

          // Verify all original record IDs are still present
          for (const recordId of recordIds) {
            expect(allRecords).toContain(recordId);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
