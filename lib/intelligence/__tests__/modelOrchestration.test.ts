/**
 * Unit tests for Multi-Model Orchestration
 * Requirements: 16.3, 16.4, 16.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelId, LLMTask, LLMResponse } from '../types';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const benchmarkStore: Record<string, unknown>[] = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    modelBenchmark: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        let results = [...benchmarkStore];
        if (where?.taskType) results = results.filter((r) => r.taskType === where.taskType);
        if (where?.modelId) results = results.filter((r) => r.modelId === where.modelId);
        if (where?.lastBenchmarked && typeof where.lastBenchmarked === 'object') {
          const range = where.lastBenchmarked as { gte?: Date; lte?: Date };
          if (range.gte) results = results.filter((r) => (r.lastBenchmarked as Date) >= range.gte!);
          if (range.lte) results = results.filter((r) => (r.lastBenchmarked as Date) <= range.lte!);
        }
        return results;
      }),
      upsert: vi.fn(async ({ where, create }: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = where.modelId_taskType as Record<string, string>;
        const existing = benchmarkStore.findIndex(
          (r) => r.modelId === key?.modelId && r.taskType === key?.taskType
        );
        const now = new Date();
        if (existing >= 0) {
          Object.assign(benchmarkStore[existing], create);
          return benchmarkStore[existing];
        }
        const record = { id: `bench-${Date.now()}`, createdAt: now, updatedAt: now, ...create };
        benchmarkStore.push(record);
        return record;
      }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import {
  selectModel,
  executeWithFallback,
  benchmarkModel,
  getBenchmarks,
  registerNewModel,
  getOptimalModelForCost,
  getCostAnalytics,
} from '../modelOrchestration';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResponse(modelId: ModelId, content: string, tokensUsed = 100): LLMResponse {
  return { modelId, content, tokensUsed, costCents: 0.05, latencyMs: 500, finishReason: 'stop' };
}

type CallModelFn = (modelId: ModelId, task: LLMTask) => Promise<LLMResponse>;

function makeCallModel(responses: Array<LLMResponse | Error>): CallModelFn {
  let i = 0;
  return async (_modelId: ModelId, _task: LLMTask): Promise<LLMResponse> => {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r;
  };
}

function addBenchmark(overrides: Record<string, unknown>) {
  benchmarkStore.push({
    id: `bench-${Math.random()}`,
    quality: 85,
    latencyP50Ms: 1000,
    latencyP95Ms: 2000,
    costPer1kTokensCents: 0.5,
    errorRate: 0.01,
    sampleSize: 100,
    lastBenchmarked: new Date(),
    ...overrides,
  });
}

// ── selectModel ────────────────────────────────────────────────────────────────

describe('selectModel', () => {
  beforeEach(() => {
    benchmarkStore.length = 0;
    vi.clearAllMocks();
  });

  it('returns a RoutingDecision with required fields', async () => {
    const decision = await selectModel('email_generation', {
      minQuality: 70,
      maxLatency: 5000,
      maxCost: 1,
    });
    expect(decision.selectedModel).toBeTruthy();
    expect(typeof decision.reason).toBe('string');
    expect(Array.isArray(decision.fallbackModels)).toBe(true);
    expect(typeof decision.estimatedCost).toBe('number');
    expect(typeof decision.estimatedLatency).toBe('number');
  });

  it('selects a high-quality model when quality is required', async () => {
    const decision = await selectModel('audit', {
      minQuality: 85,
      maxLatency: 10000,
      maxCost: 10,
    });
    const highQualityModels: ModelId[] = ['claude-3-opus', 'gpt-4o', 'gpt-4-turbo', 'claude-3-sonnet'];
    expect(highQualityModels).toContain(decision.selectedModel);
  });

  it('selects cheapest model when cost is the primary constraint', async () => {
    const decision = await selectModel('audit', {
      minQuality: 0,
      maxLatency: 10000,
      maxCost: 0.01,
    });
    expect(decision.selectedModel).toBe('llama-3');
  });

  it('uses benchmarked quality data when available', async () => {
    addBenchmark({
      modelId: 'gemini-pro',
      taskType: 'email_generation',
      quality: 99,
      latencyP95Ms: 800,
      costPer1kTokensCents: 0.05,
    });
    const decision = await selectModel('email_generation', {
      minQuality: 90,
      maxLatency: 5000,
      maxCost: 1,
    });
    expect(decision.selectedModel).toBe('gemini-pro');
  });

  it('includes fallback models in the decision', async () => {
    const decision = await selectModel('proposal_writing', {
      minQuality: 0,
      maxLatency: 100000,
      maxCost: 100,
    });
    expect(decision.fallbackModels.length).toBeGreaterThan(0);
    expect(decision.fallbackModels).not.toContain(decision.selectedModel);
  });

  it('falls back to best available when no model meets requirements', async () => {
    const decision = await selectModel('audit', {
      minQuality: 999,
      maxLatency: 1,
      maxCost: 0.0001,
    });
    expect(decision.selectedModel).toBeTruthy();
    expect(decision.reason).toContain('highest quality available');
  });
});

// ── executeWithFallback ────────────────────────────────────────────────────────

describe('executeWithFallback', () => {
  const task: LLMTask = {
    taskType: 'email_generation',
    prompt: 'Write an email',
    maxTokens: 200,
    temperature: 0.7,
  };

  it('returns response from primary model on success', async () => {
    const callModel = makeCallModel([makeResponse('gpt-4o', 'hello world', 50)]);
    const routing = {
      selectedModel: 'gpt-4o' as ModelId,
      reason: 'test',
      fallbackModels: ['claude-3-sonnet' as ModelId],
      estimatedCost: 0.025,
      estimatedLatency: 1200,
    };

    const response = await executeWithFallback(task, routing, callModel);

    expect(response.modelId).toBe('gpt-4o');
    expect(response.content).toBe('hello world');
    expect(response.tokensUsed).toBe(50);
  });

  it('falls back to next model when primary fails', async () => {
    const callModel = makeCallModel([
      new Error('Service unavailable'),
      makeResponse('claude-3-sonnet', 'fallback response', 100),
    ]);
    const routing = {
      selectedModel: 'gpt-4o' as ModelId,
      reason: 'test',
      fallbackModels: ['claude-3-sonnet' as ModelId],
      estimatedCost: 0.025,
      estimatedLatency: 1200,
    };

    const response = await executeWithFallback(task, routing, callModel);

    expect(response.modelId).toBe('claude-3-sonnet');
    expect(response.content).toBe('fallback response');
  });

  it('exhausts all fallbacks before throwing', async () => {
    const callModel = makeCallModel([
      new Error('Unavailable'),
      new Error('Unavailable'),
      new Error('Unavailable'),
    ]);
    const routing = {
      selectedModel: 'gpt-4o' as ModelId,
      reason: 'test',
      fallbackModels: ['claude-3-sonnet' as ModelId, 'gemini-pro' as ModelId],
      estimatedCost: 0.025,
      estimatedLatency: 1200,
    };

    await expect(executeWithFallback(task, routing, callModel)).rejects.toThrow(/All models failed/);
  });

  it('no task fails due to single model unavailability', async () => {
    const callModel = makeCallModel([
      new Error('Timeout'),
      new Error('Rate limited'),
      makeResponse('gemini-pro', 'gemini response', 80),
    ]);
    const routing = {
      selectedModel: 'gpt-4o' as ModelId,
      reason: 'test',
      fallbackModels: ['claude-3-opus' as ModelId, 'gemini-pro' as ModelId],
      estimatedCost: 0.025,
      estimatedLatency: 1200,
    };

    const response = await executeWithFallback(task, routing, callModel);
    expect(response.modelId).toBe('gemini-pro');
    expect(response.content).toBe('gemini response');
  });
});

// ── benchmarkModel ─────────────────────────────────────────────────────────────

describe('benchmarkModel', () => {
  beforeEach(() => {
    benchmarkStore.length = 0;
    vi.clearAllMocks();
  });

  it('persists benchmark results to the database', async () => {
    const callModel = makeCallModel([
      makeResponse('gpt-4o', 'output 1', 200),
      makeResponse('gpt-4o', 'output 2', 200),
    ]);

    const result = await benchmarkModel(
      'gpt-4o',
      'email_generation',
      [{ input: 'Write email 1' }, { input: 'Write email 2' }],
      callModel
    );

    expect(result.modelId).toBe('gpt-4o');
    expect(result.taskType).toBe('email_generation');
    expect(result.sampleSize).toBe(2);
    expect(result.metrics.quality).toBeGreaterThanOrEqual(0);
    expect(result.metrics.quality).toBeLessThanOrEqual(100);
    expect(result.metrics.errorRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.errorRate).toBeLessThanOrEqual(1);

    const { prisma } = await import('@/lib/prisma');
    expect(prisma.modelBenchmark.upsert).toHaveBeenCalledOnce();
  });

  it('computes quality score of 100 when output matches expected', async () => {
    const callModel = makeCallModel([makeResponse('gpt-4o', 'hello world test', 50)]);

    const result = await benchmarkModel(
      'gpt-4o',
      'test_task',
      [{ input: 'prompt', expectedOutput: 'hello world test' }],
      callModel
    );

    expect(result.metrics.quality).toBe(100);
  });

  it('records error rate when model calls fail', async () => {
    const callModel = makeCallModel([
      makeResponse('gpt-4o', 'ok', 50),
      new Error('API error'),
    ]);

    const result = await benchmarkModel(
      'gpt-4o',
      'test_task',
      [{ input: 'prompt 1' }, { input: 'prompt 2' }],
      callModel
    );

    expect(result.metrics.errorRate).toBe(0.5);
  });

  it('throws when no test cases provided', async () => {
    await expect(benchmarkModel('gpt-4o', 'test_task', [])).rejects.toThrow(
      'At least one test case is required'
    );
  });
});

// ── getOptimalModelForCost ─────────────────────────────────────────────────────

describe('getOptimalModelForCost', () => {
  beforeEach(() => {
    benchmarkStore.length = 0;
    vi.clearAllMocks();
  });

  it('returns a model within the cost constraint', async () => {
    const modelId = await getOptimalModelForCost('audit', 0.01);
    expect(modelId).toBe('llama-3');
  });

  it('returns highest quality model within budget', async () => {
    const modelId = await getOptimalModelForCost('proposal_writing', 1);
    expect(modelId).toBeTruthy();
  });

  it('returns cheapest model when nothing fits budget', async () => {
    const modelId = await getOptimalModelForCost('audit', 0.000001);
    expect(modelId).toBe('llama-3');
  });
});

// ── getCostAnalytics ───────────────────────────────────────────────────────────

describe('getCostAnalytics', () => {
  beforeEach(() => {
    benchmarkStore.length = 0;
    vi.clearAllMocks();
  });

  it('returns analytics with required fields', async () => {
    const now = new Date();
    const dateRange = {
      start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      end: now,
    };

    const analytics = await getCostAnalytics(dateRange);

    expect(typeof analytics.totalCostCents).toBe('number');
    expect(analytics.costByModel).toBeDefined();
    expect(analytics.costByTaskType).toBeDefined();
    expect(typeof analytics.averageCostPerAuditCents).toBe('number');
    expect(['increasing', 'decreasing', 'stable']).toContain(analytics.trend);
    expect(analytics.period).toEqual(dateRange);
  });

  it('aggregates costs from benchmark records', async () => {
    const now = new Date();
    addBenchmark({
      modelId: 'gpt-4o',
      taskType: 'audit',
      costPer1kTokensCents: 0.5,
      sampleSize: 100,
      lastBenchmarked: now,
    });

    const analytics = await getCostAnalytics({
      start: new Date(now.getTime() - 60000),
      end: new Date(now.getTime() + 60000),
    });

    expect(analytics.totalCostCents).toBeGreaterThan(0);
    expect(analytics.costByModel['gpt-4o']).toBeGreaterThan(0);
    expect(analytics.costByTaskType['audit']).toBeGreaterThan(0);
  });
});

// ── registerNewModel ───────────────────────────────────────────────────────────

describe('registerNewModel', () => {
  it('registers a model without throwing', async () => {
    await expect(registerNewModel('gpt-4o', 'openai')).resolves.toBeUndefined();
  });
});

// ── getBenchmarks ──────────────────────────────────────────────────────────────

describe('getBenchmarks', () => {
  beforeEach(() => {
    benchmarkStore.length = 0;
    vi.clearAllMocks();
  });

  it('returns empty array when no benchmarks exist', async () => {
    const results = await getBenchmarks();
    expect(results).toEqual([]);
  });

  it('filters by taskType', async () => {
    addBenchmark({ modelId: 'gpt-4o', taskType: 'email_generation' });
    addBenchmark({ modelId: 'claude-3-opus', taskType: 'proposal_writing' });

    const results = await getBenchmarks({ taskType: 'email_generation' });
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('gpt-4o');
    expect(results[0].taskType).toBe('email_generation');
  });

  it('maps DB fields to ModelBenchmark interface correctly', async () => {
    addBenchmark({
      modelId: 'gemini-pro',
      taskType: 'audit',
      quality: 80,
      latencyP50Ms: 800,
      latencyP95Ms: 1500,
      costPer1kTokensCents: 0.05,
      errorRate: 0.02,
      sampleSize: 200,
    });

    const [bench] = await getBenchmarks({ modelId: 'gemini-pro' });

    expect(bench.modelId).toBe('gemini-pro');
    expect(bench.metrics.quality).toBe(80);
    expect(bench.metrics.latencyP50).toBe(800);
    expect(bench.metrics.latencyP95).toBe(1500);
    expect(bench.metrics.costPer1kTokens).toBe(0.05);
    expect(bench.metrics.errorRate).toBe(0.02);
    expect(bench.sampleSize).toBe(200);
  });
});
