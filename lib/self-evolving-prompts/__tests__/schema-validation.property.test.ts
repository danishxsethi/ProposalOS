/**
 * Property-Based Tests for Schema Validation
 * Feature: self-evolving-prompts-predictive-intelligence
 * Property 37: Version History Data Completeness
 * Validates: Requirements 10.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  createVersion,
  getVersionHistoryWithDeltas,
  getVersionByHash,
} from '../data-access/prompt-versions';
import { logPerformance } from '../data-access/prompt-performance';
import { prisma } from '../db';

describe('Property 37: Version History Data Completeness', () => {
  beforeAll(async () => {
    // Ensure database connection is ready
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE node_id LIKE 'test-node-%'`;
    await prisma.$executeRaw`DELETE FROM prompt_versions WHERE node_id LIKE 'test-node-%'`;
    await prisma.$disconnect();
  });

  /**
   * Property 37: Version History Data Completeness
   * 
   * For any stored prompt version, the record SHALL include complete changelog
   * and performance delta information (where performance data is available).
   * 
   * This property verifies that:
   * 1. Every version has a non-empty changelog
   * 2. Versions with parent versions have performance deltas when data exists
   * 3. All required fields are present and non-null
   */
  it('should maintain complete version history data for all versions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data: node ID, number of versions, and version details
        fc.record({
          nodeId: fc.string({ minLength: 5, maxLength: 20 }).map(s => `test-node-${s}`),
          versions: fc.array(
            fc.record({
              promptText: fc.string({ minLength: 10, maxLength: 200 }),
              changelog: fc.string({ minLength: 5, maxLength: 100 }),
              createdBy: fc.constantFrom('system', 'user', 'evolution-engine'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ nodeId, versions }) => {
          const createdVersions: string[] = [];

          try {
            // Create versions sequentially (each referencing the previous)
            let parentHash: string | undefined = undefined;

            for (const versionData of versions) {
              const version = await createVersion(
                nodeId,
                versionData.promptText,
                versionData.createdBy,
                versionData.changelog,
                parentHash
              );

              createdVersions.push(version.versionHash);

              // Log some performance data for this version
              await logPerformance({
                promptVersionHash: version.versionHash,
                nodeId,
                qualityScore: Math.random() * 100,
                downstreamImpact: Math.random() * 100,
                costUSD: Math.random() * 0.01,
                latencyMs: Math.floor(Math.random() * 2000) + 500,
                inputTokens: Math.floor(Math.random() * 1000) + 100,
                outputTokens: Math.floor(Math.random() * 500) + 50,
                metadata: {},
              });

              parentHash = version.versionHash;
            }

            // Retrieve version history with deltas
            const history = await getVersionHistoryWithDeltas(nodeId);

            // Verify completeness for each version
            for (const version of history) {
              // 1. Changelog must be non-empty
              expect(version.changelog).toBeTruthy();
              expect(version.changelog.length).toBeGreaterThan(0);

              // 2. All required fields must be present
              expect(version.versionHash).toBeTruthy();
              expect(version.nodeId).toBe(nodeId);
              expect(version.promptText).toBeTruthy();
              expect(version.createdAt).toBeInstanceOf(Date);
              expect(version.createdBy).toBeTruthy();
              expect(version.branchName).toBeTruthy();
              expect(typeof version.isActive).toBe('boolean');

              // 3. If version has a parent, it should have performance delta
              if (version.parentVersionHash) {
                // Performance delta should exist when both versions have data
                const parentVersion = await getVersionByHash(version.parentVersionHash);
                if (parentVersion) {
                  // Delta should be calculated
                  expect(version.performanceDelta).toBeDefined();
                  if (version.performanceDelta) {
                    expect(typeof version.performanceDelta.qualityScoreChange).toBe('number');
                    expect(typeof version.performanceDelta.costChange).toBe('number');
                    expect(typeof version.performanceDelta.latencyChange).toBe('number');
                    expect(version.performanceDelta.comparedToVersion).toBe(version.parentVersionHash);
                  }
                }
              }
            }

            // Verify all created versions are in the history
            expect(history.length).toBe(versions.length);
            const historyHashes = history.map(v => v.versionHash);
            for (const hash of createdVersions) {
              expect(historyHashes).toContain(hash);
            }

          } finally {
            // Clean up test data
            for (const hash of createdVersions) {
              await prisma.$executeRaw`DELETE FROM prompt_performance_logs WHERE prompt_version_hash = ${hash}`;
              await prisma.$executeRaw`DELETE FROM prompt_versions WHERE version_hash = ${hash}`;
            }
          }
        }
      ),
      { numRuns: 20, timeout: 30000 } // Reduced runs for database operations
    );
  });

  /**
   * Additional test: Verify changelog is never empty
   */
  it('should reject versions with empty changelogs', async () => {
    const nodeId = 'test-node-empty-changelog';
    
    await expect(async () => {
      await createVersion(
        nodeId,
        'Test prompt text',
        'system',
        '', // Empty changelog
      );
    }).rejects.toThrow();
  });

  /**
   * Additional test: Verify all fields are persisted correctly
   */
  it('should persist all version fields correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          nodeId: fc.string({ minLength: 5, maxLength: 20 }).map(s => `test-node-persist-${s}`),
          promptText: fc.string({ minLength: 10, maxLength: 200 }),
          changelog: fc.string({ minLength: 5, maxLength: 100 }),
          createdBy: fc.constantFrom('system', 'user', 'evolution-engine'),
          branchName: fc.constantFrom('main', 'experimental', 'feature-test'),
        }),
        async ({ nodeId, promptText, changelog, createdBy, branchName }) => {
          try {
            // Create version
            const created = await createVersion(
              nodeId,
              promptText,
              createdBy,
              changelog,
              undefined,
              branchName
            );

            // Retrieve version
            const retrieved = await getVersionByHash(created.versionHash);

            // Verify all fields match
            expect(retrieved).toBeDefined();
            expect(retrieved!.versionHash).toBe(created.versionHash);
            expect(retrieved!.nodeId).toBe(nodeId);
            expect(retrieved!.promptText).toBe(promptText);
            expect(retrieved!.createdBy).toBe(createdBy);
            expect(retrieved!.changelog).toBe(changelog);
            expect(retrieved!.branchName).toBe(branchName);
            expect(retrieved!.isActive).toBe(false);

          } finally {
            // Clean up
            await prisma.$executeRaw`DELETE FROM prompt_versions WHERE node_id = ${nodeId}`;
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
