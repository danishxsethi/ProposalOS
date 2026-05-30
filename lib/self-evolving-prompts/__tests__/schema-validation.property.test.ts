/**
 * Property-Based Tests for Schema Validation
 * Feature: self-evolving-prompts-predictive-intelligence
 * Property 37: Version History Data Completeness
 * Validates: Requirements 10.3
 */

import * as fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { logPerformance } from '../data-access/prompt-performance';
import {
  createVersion,
  getVersionByHash,
  getVersionHistoryWithDeltas,
} from '../data-access/prompt-versions';
import { prisma } from '../db';

describe('Property 37: Version History Data Completeness', () => {
  const testTenantId = '11111111-1111-4111-a111-111111111111';

  async function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    const { runWithTenantAsync } = await import('@/lib/tenant/context');
    return runWithTenantAsync(testTenantId, fn);
  }

  beforeAll(async () => {
    // Ensure database connection is ready
    await prisma.$connect();

    // Seed test tenant under bypass
    const { runWithTenantBypass } = await import('@/lib/tenant/context');
    await runWithTenantBypass('seed-test-tenant', async () => {
      await prisma.tenant.upsert({
        where: { id: testTenantId },
        update: {},
        create: {
          id: testTenantId,
          name: 'Tracker Test Tenant',
          planTier: 'pro',
          status: 'active',
        },
      });
    });
  });

  afterAll(async () => {
    // Clean up test data under bypass
    const { runWithTenantBypass } = await import('@/lib/tenant/context');
    await runWithTenantBypass('test-cleanup', async () => {
      await prisma.$executeRaw`DELETE FROM "PromptPerformanceLog" WHERE "nodeId" LIKE 'test-node-%'`;
      await prisma.$executeRaw`DELETE FROM "PromptVersion" WHERE "nodeId" LIKE 'test-node-%'`;
    });
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
          nodeId: fc.string({ minLength: 5, maxLength: 20 })
            .filter((s) => s.trim().length >= 5)
            .map((s) => `test-node-${s}`),
          versions: fc.array(
            fc.record({
              promptText: fc.string({ minLength: 10, maxLength: 200 })
                .filter((s) => s.trim().length >= 10),
              changelog: fc.string({ minLength: 5, maxLength: 100 })
                .filter((s) => s.trim().length >= 5),
              createdBy: fc.constantFrom('system', 'user', 'evolution-engine'),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        async ({ nodeId, versions }) => {
          const createdVersions: string[] = [];

          try {
            await withTenant(async () => {
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
                      expect(version.performanceDelta.comparedToVersion).toBe(
                        version.parentVersionHash
                      );
                    }
                  }
                }
              }

              // Verify all created versions are in the history
              expect(history.length).toBe(versions.length);
              const historyHashes = history.map((v) => v.versionHash);
              for (const hash of createdVersions) {
                expect(historyHashes).toContain(hash);
              }
            });
          } finally {
            // Clean up test data under bypass
            const { runWithTenantBypass } = await import('@/lib/tenant/context');
            await runWithTenantBypass('test-cleanup', async () => {
              for (const hash of createdVersions) {
                await prisma.$executeRaw`DELETE FROM "PromptPerformanceLog" WHERE "promptVersionHash" = ${hash}`;
                await prisma.$executeRaw`DELETE FROM "PromptVersion" WHERE "versionHash" = ${hash}`;
              }
            });
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

    await withTenant(async () => {
      await expect(async () => {
        await createVersion(
          nodeId,
          'Test prompt text',
          'system',
          '' // Empty changelog
        );
      }).rejects.toThrow();
    });
  });

  /**
   * Additional test: Verify all fields are persisted correctly
   */
  it('should persist all version fields correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          nodeId: fc.string({ minLength: 5, maxLength: 20 })
            .filter((s) => s.trim().length >= 5)
            .map((s) => `test-node-persist-${s}`),
          promptText: fc.string({ minLength: 10, maxLength: 200 })
            .filter((s) => s.trim().length >= 10),
          changelog: fc.string({ minLength: 5, maxLength: 100 })
            .filter((s) => s.trim().length >= 5),
          createdBy: fc.constantFrom('system', 'user', 'evolution-engine'),
          branchName: fc.constantFrom('main', 'experimental', 'feature-test'),
        }),
        async ({ nodeId, promptText, changelog, createdBy, branchName }) => {
          try {
            await withTenant(async () => {
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
            });
          } finally {
            // Clean up under bypass
            const { runWithTenantBypass } = await import('@/lib/tenant/context');
            await runWithTenantBypass('test-cleanup', async () => {
              await prisma.$executeRaw`DELETE FROM "PromptVersion" WHERE "nodeId" = ${nodeId}`;
            });
          }
        }
      ),
      { numRuns: 20, timeout: 30000 }
    );
  });
});
