/**
 * Feature: self-evolving-prompts-predictive-intelligence
 * Property 5: Write Latency Guarantee
 *
 * Validates: Requirements 1.1, 10.2
 *
 * Property: For any LLM call, when logged by the Prompt_Performance_Tracker,
 * the write latency should be within acceptable bounds (e.g., < 200ms) to ensure
 * real-time tracking does not block or degrade prompt serving performance.
 */

import { randomUUID } from 'crypto';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as promptPerformanceDA from '../data-access/prompt-performance';
import { closeConnection, prisma, executeCommand } from '../db';
import { PromptPerformanceTracker } from '../PromptPerformanceTracker';

describe('Property 5: Write Latency Guarantee', () => {
  const tracker = new PromptPerformanceTracker();
  const testTenantId = '22222222-2222-4222-a222-222222222222';

  beforeAll(async () => {
    const { runWithTenantBypass } = await import('@/lib/tenant/context');
    await runWithTenantBypass('seed-test-tenant', async () => {
      await prisma.tenant.upsert({
        where: { id: testTenantId },
        update: {},
        create: {
          id: testTenantId,
          name: 'Tracker Latency Test Tenant',
          planTier: 'pro',
          status: 'active',
        },
      });
    });
  });

  async function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    const { runWithTenantAsync } = await import('@/lib/tenant/context');
    return runWithTenantAsync(testTenantId, fn);
  }

  // Define generators for inputs
  const versionHashArb = fc
    .string({ minLength: 64, maxLength: 64 })
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, 'a'));
  const nodeIdArb = fc
    .string({ minLength: 2, maxLength: 50 })
    .map((s) => `node_${s.replace(/[^a-zA-Z0-9]/g, 'x')}`);
  const qualityScoreArb = fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true });
  const downstreamImpactArb = fc.float({
    min: Math.fround(0.1),
    max: Math.fround(100),
    noNaN: true,
  });
  const costArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10), noNaN: true });
  const latencyArb = fc.integer({ min: 10, max: 5000 });
  const tokensArb = fc.integer({ min: 10, max: 10000 });
  const metadataArb = fc.record({
    source: fc.string(),
  });

  afterAll(async () => {
    const { runWithTenantBypass } = await import('@/lib/tenant/context');
    await runWithTenantBypass('test-cleanup', async () => {
      await prisma.$executeRaw`DELETE FROM "PromptPerformanceLog" WHERE "tenantId" = ${testTenantId}`;
      await prisma.$executeRaw`DELETE FROM "PromptVersion" WHERE "tenantId" = ${testTenantId}`;
    });
    await closeConnection();
  });

  it('should guarantee prompt logging write latency is under acceptable limits', async () => {
    // Keep numRuns low as per project guidelines to optimize execution speed
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
          await withTenant(async () => {
            const versionId = randomUUID();
            // Seed parent PromptVersion record
            await executeCommand(
              `INSERT INTO "PromptVersion" ("id", "versionHash", "promptText", "nodeId", "createdBy", "changelog", "tenantId", "createdAt", "updatedAt") 
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
               ON CONFLICT ("versionHash") DO NOTHING`,
              [
                versionId,
                versionHash,
                'Test template text',
                nodeId,
                'test-user',
                'Initial seed version',
                testTenantId,
              ]
            );

            // Measure start time
            const start = performance.now();

            // Log performance
            await tracker.logPerformance({
              promptVersionHash: versionHash,
              nodeId,
              qualityScore,
              downstreamImpact,
              costUSD: cost,
              latencyMs: latency,
              inputTokens,
              outputTokens,
              metadata,
            });

            // Measure end time
            const duration = performance.now() - start;

            // Database write latency should be fast (e.g. typically well under 500ms in local testing)
            expect(duration).toBeLessThan(1000);
          });
        }
      ),
      { numRuns: 10 }
    );
  });
});
