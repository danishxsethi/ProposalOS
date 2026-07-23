/**
 * Property 18: Model Failover
 *
 * For any LLM task where the primary model fails, the system must route to a
 * fallback model and complete the task; no task should fail due to a single
 * model being unavailable.
 *
 * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
 * Validates: Requirements 16.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { executeWithFallback } from '../modelOrchestration';
import type { LLMTask, LLMResponse, RoutingDecision, ModelId } from '../types';

// ============================================================
// Generators
// ============================================================

const MODEL_IDS: ModelId[] = [
  'gpt-4o',
  'gpt-4-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'gemini-pro',
  'llama-3',
];

const modelIdArb: fc.Arbitrary<ModelId> = fc.constantFrom(...MODEL_IDS);

const llmTaskArb: fc.Arbitrary<LLMTask> = fc.record({
  taskType: fc.constantFrom(
    'email_generation',
    'proposal_writing',
    'objection_handling',
    'diagnosis',
    'audit',
    'scoring'
  ),
  prompt: fc.string({ minLength: 1, maxLength: 200 }),
  maxTokens: fc.integer({ min: 50, max: 4096 }),
  temperature: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  metadata: fc.option(
    fc.record({
      tenantId: fc.string({ minLength: 1, maxLength: 20 }),
      priority: fc.constantFrom('low', 'normal', 'high'),
    }),
    { nil: undefined }
  ),
});

/**
 * Generate a RoutingDecision where fallbackModels contains at least one model
 * that is DIFFERENT from the primary (so failover can actually succeed).
 */
const routingWithFallbacksArb: fc.Arbitrary<RoutingDecision> = modelIdArb.chain((primary) => {
  const otherModels = MODEL_IDS.filter((m) => m !== primary);
  // Pick at least one distinct fallback, then optionally more (may repeat)
  return fc
    .tuple(
      fc.constantFrom(...(otherModels as [ModelId, ...ModelId[]])),
      fc.array(modelIdArb, { minLength: 0, maxLength: 4 })
    )
    .map(([distinctFallback, extras]) => ({
      selectedModel: primary,
      reason: `Selected ${primary} for task`,
      fallbackModels: [distinctFallback, ...extras],
      estimatedCost: 0.01,
      estimatedLatency: 1000,
    }));
});

/** Generate a RoutingDecision with NO fallbacks */
const routingNoFallbacksArb: fc.Arbitrary<RoutingDecision> = modelIdArb.map((primary) => ({
  selectedModel: primary,
  reason: `Selected ${primary} for task`,
  fallbackModels: [],
  estimatedCost: 0.01,
  estimatedLatency: 1000,
}));

// ============================================================
// callModel helpers
// ============================================================

/**
 * Returns a callModel function that throws for the primary model but succeeds
 * for all other models.
 */
function makeCallModelFailPrimary(
  primaryModel: ModelId
): (modelId: ModelId, task: LLMTask) => Promise<LLMResponse> {
  return async (modelId: ModelId, task: LLMTask): Promise<LLMResponse> => {
    if (modelId === primaryModel) {
      throw new Error(`Primary model ${modelId} is unavailable`);
    }
    return {
      modelId,
      content: `Response from ${modelId} for: ${task.prompt.slice(0, 30)}`,
      tokensUsed: Math.min(task.maxTokens, 100),
      costCents: 0.01,
      latencyMs: 500,
      finishReason: 'stop',
    };
  };
}

/**
 * Returns a callModel function that throws for a specific set of models.
 */
function makeCallModelFailSet(
  failingModels: Set<ModelId>
): (modelId: ModelId, task: LLMTask) => Promise<LLMResponse> {
  return async (modelId: ModelId, task: LLMTask): Promise<LLMResponse> => {
    if (failingModels.has(modelId)) {
      throw new Error(`Model ${modelId} is unavailable`);
    }
    return {
      modelId,
      content: `Response from ${modelId} for: ${task.prompt.slice(0, 30)}`,
      tokensUsed: Math.min(task.maxTokens, 100),
      costCents: 0.01,
      latencyMs: 500,
      finishReason: 'stop',
    };
  };
}

/** A callModel function that always fails for every model. */
const callModelAlwaysFails = async (modelId: ModelId, _task: LLMTask): Promise<LLMResponse> => {
  throw new Error(`Model ${modelId} is unavailable`);
};

// ============================================================
// Property 18: Model Failover
// ============================================================

describe('Property 18: Model Failover', () => {
  /**
   * Property 18a: When the primary model fails but at least one fallback is
   * available, executeWithFallback must complete successfully.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18a: task always completes when primary fails but fallbacks are available',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          routingWithFallbacksArb,
          async (task, routing) => {
            const callModel = makeCallModelFailPrimary(routing.selectedModel);

            const response = await executeWithFallback(task, routing, callModel);

            // Must complete — response must be defined
            expect(response).toBeDefined();
            expect(response.content).toBeTruthy();
            expect(response.finishReason).toBe('stop');
            // The response must NOT come from the failed primary model
            expect(response.modelId).not.toBe(routing.selectedModel);
            // The responding model must be one of the fallbacks
            expect(routing.fallbackModels).toContain(response.modelId);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 18b: When ALL models fail, executeWithFallback must throw an error
   * (not silently return undefined or a partial result).
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18b: task fails with an error only when ALL models fail',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          routingWithFallbacksArb,
          async (task, routing) => {
            await expect(
              executeWithFallback(task, routing, callModelAlwaysFails)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 18c: When the primary model succeeds, the response comes from the
   * primary model (no unnecessary fallback).
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18c: primary model is used when it succeeds (no unnecessary fallback)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          routingWithFallbacksArb,
          async (task, routing) => {
            // callModel that always succeeds
            const callModelAlwaysSucceeds = async (
              modelId: ModelId,
              t: LLMTask
            ): Promise<LLMResponse> => ({
              modelId,
              content: `Response from ${modelId} for: ${t.prompt.slice(0, 30)}`,
              tokensUsed: Math.min(t.maxTokens, 100),
              costCents: 0.01,
              latencyMs: 500,
              finishReason: 'stop',
            });

            const response = await executeWithFallback(task, routing, callModelAlwaysSucceeds);

            // Primary model should be used first
            expect(response.modelId).toBe(routing.selectedModel);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 18d: Failover is exhaustive — the system tries models in order
   * (primary first, then fallbacks in sequence) until one succeeds.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18d: failover tries models in order until one succeeds',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          // Build routing with 3 distinct models: primary, first fallback (will fail), second fallback (will succeed)
          fc
            .tuple(
              fc.integer({ min: 0, max: MODEL_IDS.length - 1 }),
              fc.integer({ min: 0, max: MODEL_IDS.length - 2 }),
              fc.integer({ min: 0, max: MODEL_IDS.length - 3 })
            )
            .map(([i0, i1, i2]) => {
              // Pick 3 distinct models by index
              const pool = [...MODEL_IDS];
              const primary = pool.splice(i0 % pool.length, 1)[0];
              const firstFallback = pool.splice(i1 % pool.length, 1)[0];
              const secondFallback = pool.splice(i2 % pool.length, 1)[0];
              return {
                selectedModel: primary,
                reason: `Selected ${primary}`,
                fallbackModels: [firstFallback, secondFallback],
                estimatedCost: 0.01,
                estimatedLatency: 1000,
              };
            }),
          async (task, routing) => {
            // Fail primary AND first fallback; second fallback should succeed
            const failingModels = new Set<ModelId>([
              routing.selectedModel,
              routing.fallbackModels[0],
            ]);
            const callModel = makeCallModelFailSet(failingModels);

            const response = await executeWithFallback(task, routing, callModel);

            expect(response).toBeDefined();
            // The response must come from a non-failing model
            expect(failingModels.has(response.modelId)).toBe(false);
            // Specifically, it must be the second fallback
            expect(response.modelId).toBe(routing.fallbackModels[1]);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 18e: When there are no fallbacks and the primary fails, the task
   * must throw (single point of failure is correctly surfaced).
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18e: task throws when primary fails and no fallbacks are configured',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          routingNoFallbacksArb,
          async (task, routing) => {
            const callModel = makeCallModelFailPrimary(routing.selectedModel);

            await expect(
              executeWithFallback(task, routing, callModel)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  /**
   * Property 18f: The response content is always non-empty when the task
   * completes successfully via any model (primary or fallback).
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 18: Model Failover
   * Validates: Requirements 16.4
   */
  it(
    'Property 18f: successful response always has non-empty content',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          llmTaskArb,
          routingWithFallbacksArb,
          // Randomly decide whether primary fails
          fc.boolean(),
          async (task, routing, primaryFails) => {
            const callModel = primaryFails
              ? makeCallModelFailPrimary(routing.selectedModel)
              : async (modelId: ModelId, t: LLMTask): Promise<LLMResponse> => ({
                  modelId,
                  content: `Response from ${modelId} for: ${t.prompt.slice(0, 30)}`,
                  tokensUsed: Math.min(t.maxTokens, 100),
                  costCents: 0.01,
                  latencyMs: 500,
                  finishReason: 'stop',
                });

            const response = await executeWithFallback(task, routing, callModel);

            expect(response.content).toBeTruthy();
            expect(response.content.length).toBeGreaterThan(0);
            expect(response.tokensUsed).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
