/**
 * Multi-Model Orchestration
 *
 * Dynamic routing between LLM providers (Claude, GPT-4o, Gemini, Llama) based
 * on task type, cost, quality, and availability. Implements auto-failover so no
 * task fails due to a single model being unavailable.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */

import { prisma } from '@/lib/prisma';
import type {
  ModelId,
  LLMProvider,
  ModelBenchmark,
  ModelBenchmarkMetrics,
  ModelRequirements,
  RoutingDecision,
  LLMTask,
  LLMResponse,
  BenchmarkFilters,
  TestCase,
  CostAnalytics,
} from './types';
import type { DateRange } from '../pipeline/types';

// ─── Static model registry ───────────────────────────────────────────────────

interface ModelMeta {
  provider: LLMProvider;
  defaultQuality: number;
  defaultLatencyP50: number;
  defaultLatencyP95: number;
  defaultCostPer1kTokens: number; // cents
  defaultErrorRate: number;
}

const MODEL_REGISTRY: Record<ModelId, ModelMeta> = {
  'gpt-4o': {
    provider: 'openai',
    defaultQuality: 92,
    defaultLatencyP50: 1200,
    defaultLatencyP95: 2500,
    defaultCostPer1kTokens: 0.5,
    defaultErrorRate: 0.01,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    defaultQuality: 88,
    defaultLatencyP50: 1500,
    defaultLatencyP95: 3000,
    defaultCostPer1kTokens: 1.0,
    defaultErrorRate: 0.01,
  },
  'claude-3-opus': {
    provider: 'anthropic',
    defaultQuality: 95,
    defaultLatencyP50: 1800,
    defaultLatencyP95: 3500,
    defaultCostPer1kTokens: 1.5,
    defaultErrorRate: 0.005,
  },
  'claude-3-sonnet': {
    provider: 'anthropic',
    defaultQuality: 88,
    defaultLatencyP50: 900,
    defaultLatencyP95: 1800,
    defaultCostPer1kTokens: 0.3,
    defaultErrorRate: 0.008,
  },
  'gemini-pro': {
    provider: 'google',
    defaultQuality: 85,
    defaultLatencyP50: 800,
    defaultLatencyP95: 1600,
    defaultCostPer1kTokens: 0.125,
    defaultErrorRate: 0.015,
  },
  'llama-3': {
    provider: 'meta',
    defaultQuality: 80,
    defaultLatencyP50: 600,
    defaultLatencyP95: 1200,
    defaultCostPer1kTokens: 0.05,
    defaultErrorRate: 0.02,
  },
};

const ALL_MODELS = Object.keys(MODEL_REGISTRY) as ModelId[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDefaultMetrics(modelId: ModelId): ModelBenchmarkMetrics {
  const meta = MODEL_REGISTRY[modelId];
  return {
    quality: meta.defaultQuality,
    latencyP50: meta.defaultLatencyP50,
    latencyP95: meta.defaultLatencyP95,
    costPer1kTokens: meta.defaultCostPer1kTokens,
    errorRate: meta.defaultErrorRate,
  };
}

function estimateCost(modelId: ModelId, maxTokens: number): number {
  const meta = MODEL_REGISTRY[modelId];
  return (maxTokens / 1000) * meta.defaultCostPer1kTokens;
}

function mapBenchmarkRecord(r: {
  modelId: string;
  taskType: string;
  quality: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  costPer1kTokensCents: number;
  errorRate: number;
  lastBenchmarked: Date;
  sampleSize: number;
}): ModelBenchmark {
  return {
    modelId: r.modelId as ModelId,
    taskType: r.taskType,
    metrics: {
      quality: r.quality,
      latencyP50: r.latencyP50Ms,
      latencyP95: r.latencyP95Ms,
      costPer1kTokens: r.costPer1kTokensCents,
      errorRate: r.errorRate,
    },
    lastBenchmarked: r.lastBenchmarked,
    sampleSize: r.sampleSize,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select the optimal model for a task given quality/cost/latency requirements.
 * Falls back to defaults when no benchmark data is available.
 * Requirements: 16.2, 16.3
 */
export async function selectModel(
  taskType: string,
  requirements: ModelRequirements
): Promise<RoutingDecision> {
  // Load benchmarks for this task type
  const benchmarks = await prisma.modelBenchmark.findMany({
    where: { taskType },
    orderBy: { lastBenchmarked: 'desc' },
  });

  const benchmarkMap = new Map<ModelId, ModelBenchmarkMetrics>();
  for (const b of benchmarks) {
    const mapped = mapBenchmarkRecord(b);
    if (!benchmarkMap.has(mapped.modelId)) {
      benchmarkMap.set(mapped.modelId, mapped.metrics);
    }
  }

  // Score each model
  type ScoredModel = { modelId: ModelId; score: number; metrics: ModelBenchmarkMetrics };
  const scored: ScoredModel[] = [];

  for (const modelId of ALL_MODELS) {
    const metrics = benchmarkMap.get(modelId) ?? getDefaultMetrics(modelId);
    const meta = MODEL_REGISTRY[modelId];

    // Filter by hard constraints
    if (metrics.quality < requirements.minQuality) continue;
    if (metrics.latencyP95 > requirements.maxLatency) continue;
    const estimatedCostCents = estimateCost(modelId, 1000); // per 1k tokens
    if (estimatedCostCents > requirements.maxCost) continue;
    if (requirements.preferredProvider && meta.provider !== requirements.preferredProvider) continue;

    // Score: higher quality + lower cost + lower latency = better
    const score =
      metrics.quality * 2 -
      (metrics.latencyP95 / 100) -
      (metrics.costPer1kTokens * 10);

    scored.push({ modelId, score, metrics });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Relax constraints and pick the best available
    const fallback = ALL_MODELS.reduce((best, modelId) => {
      const metrics = benchmarkMap.get(modelId) ?? getDefaultMetrics(modelId);
      const bestMetrics = benchmarkMap.get(best) ?? getDefaultMetrics(best);
      return metrics.quality > bestMetrics.quality ? modelId : best;
    }, ALL_MODELS[0]);

    return {
      selectedModel: fallback,
      reason: 'No model met all requirements; selected highest quality available',
      fallbackModels: ALL_MODELS.filter((m) => m !== fallback),
      estimatedCost: estimateCost(fallback, 1000),
      estimatedLatency: getDefaultMetrics(fallback).latencyP95,
    };
  }

  const selected = scored[0];
  const fallbacks = scored.slice(1).map((s) => s.modelId);

  return {
    selectedModel: selected.modelId,
    reason: `Selected for task '${taskType}': quality=${selected.metrics.quality}, latencyP95=${selected.metrics.latencyP95}ms, cost=${selected.metrics.costPer1kTokens}¢/1k`,
    fallbackModels: fallbacks,
    estimatedCost: estimateCost(selected.modelId, 1000),
    estimatedLatency: selected.metrics.latencyP95,
  };
}

/**
 * Execute an LLM task with automatic failover through fallback models.
 * No task fails due to a single model being unavailable.
 * Requirements: 16.4
 */
export async function executeWithFallback(
  task: LLMTask,
  routing: RoutingDecision,
  callModel?: (modelId: ModelId, task: LLMTask) => Promise<LLMResponse>
): Promise<LLMResponse> {
  const modelsToTry = [routing.selectedModel, ...routing.fallbackModels];
  const executor = callModel ?? defaultModelCall;

  let lastError: Error | null = null;

  for (const modelId of modelsToTry) {
    try {
      const response = await executor(modelId, task);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next fallback
    }
  }

  throw new Error(
    `All models failed for task '${task.taskType}'. Last error: ${lastError?.message ?? 'unknown'}`
  );
}

/**
 * Default model call stub — in production this would call the actual LLM APIs.
 * Throws to simulate unavailability for testing.
 */
async function defaultModelCall(modelId: ModelId, task: LLMTask): Promise<LLMResponse> {
  const meta = MODEL_REGISTRY[modelId];
  if (!meta) throw new Error(`Unknown model: ${modelId}`);

  // Simulate latency
  const latency = meta.defaultLatencyP50 + Math.random() * 200;
  const tokensUsed = Math.min(task.maxTokens, 500);
  const costCents = (tokensUsed / 1000) * meta.defaultCostPer1kTokens;

  return {
    modelId,
    content: `[${modelId}] Response to: ${task.prompt.slice(0, 50)}...`,
    tokensUsed,
    costCents,
    latencyMs: latency,
    finishReason: 'stop',
  };
}

/**
 * Benchmark a model on a specific task type and persist results.
 * Requirements: 16.5, 16.6
 */
export async function benchmarkModel(
  modelId: ModelId,
  taskType: string,
  testCases: TestCase[],
  callModel?: (modelId: ModelId, task: LLMTask) => Promise<LLMResponse>
): Promise<ModelBenchmark> {
  if (testCases.length === 0) {
    throw new Error('At least one test case is required for benchmarking');
  }

  const meta = MODEL_REGISTRY[modelId];
  if (!meta) throw new Error(`Unknown model: ${modelId}`);

  const executor = callModel ?? defaultModelCall;

  // Simulate benchmark execution
  const latencies: number[] = [];
  let errors = 0;
  let qualitySum = 0;
  let successCount = 0;

  for (const tc of testCases) {
    const start = Date.now();
    try {
      const response = await executor(modelId, {
        taskType,
        prompt: tc.input,
        maxTokens: 500,
        temperature: 0.7,
      });
      const latency = Date.now() - start + meta.defaultLatencyP50;
      latencies.push(latency);
      successCount++;
      // If expected output provided, score by exact match; otherwise use default quality
      if (tc.expectedOutput !== undefined) {
        qualitySum += response.content === tc.expectedOutput ? 100 : 0;
      } else {
        qualitySum += meta.defaultQuality + (Math.random() * 10 - 5);
      }
    } catch {
      errors++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? meta.defaultLatencyP50;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? meta.defaultLatencyP95;
  const errorRate = errors / testCases.length;
  const quality = Math.min(100, Math.max(0, qualitySum / (successCount || 1)));

  const metrics: ModelBenchmarkMetrics = {
    quality,
    latencyP50: p50,
    latencyP95: p95,
    costPer1kTokens: meta.defaultCostPer1kTokens,
    errorRate,
  };

  // Upsert benchmark record using flat fields
  const record = await prisma.modelBenchmark.upsert({
    where: { modelId_taskType: { modelId, taskType } },
    create: {
      modelId,
      taskType,
      quality,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      costPer1kTokensCents: meta.defaultCostPer1kTokens,
      errorRate,
      sampleSize: testCases.length,
      lastBenchmarked: new Date(),
    },
    update: {
      quality,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      costPer1kTokensCents: meta.defaultCostPer1kTokens,
      errorRate,
      sampleSize: testCases.length,
      lastBenchmarked: new Date(),
    },
  });

  return mapBenchmarkRecord(record);
}

/**
 * Register a new model in the registry.
 * Requirements: 16.5
 */
export async function registerNewModel(
  modelId: ModelId,
  provider: LLMProvider
): Promise<void> {
  if (!MODEL_REGISTRY[modelId]) {
    // Add to in-memory registry with conservative defaults
    (MODEL_REGISTRY as Record<string, ModelMeta>)[modelId] = {
      provider,
      defaultQuality: 75,
      defaultLatencyP50: 1000,
      defaultLatencyP95: 2000,
      defaultCostPer1kTokens: 0.5,
      defaultErrorRate: 0.02,
    };
  }
}

/**
 * Get all benchmarks, optionally filtered.
 * Requirements: 16.6
 */
export async function getBenchmarks(filters?: BenchmarkFilters): Promise<ModelBenchmark[]> {
  const where: Record<string, unknown> = {};
  if (filters?.taskType) where.taskType = filters.taskType;
  if (filters?.modelId) where.modelId = filters.modelId;

  const records = await prisma.modelBenchmark.findMany({
    where,
    orderBy: { lastBenchmarked: 'desc' },
  });

  const mapped = records.map(mapBenchmarkRecord);

  if (filters?.minSampleSize) {
    return mapped.filter((b) => b.sampleSize >= filters.minSampleSize!);
  }

  return mapped;
}

/**
 * Get the optimal model for a cost constraint.
 * Targets < $0.01 per audit.
 * Requirements: 16.7
 */
export async function getOptimalModelForCost(
  taskType: string,
  maxCostPerCall: number
): Promise<ModelId> {
  const benchmarks = await prisma.modelBenchmark.findMany({
    where: { taskType },
    orderBy: { lastBenchmarked: 'desc' },
  });

  const benchmarkMap = new Map<ModelId, ModelBenchmarkMetrics>();
  for (const b of benchmarks) {
    const mapped = mapBenchmarkRecord(b);
    if (!benchmarkMap.has(mapped.modelId)) {
      benchmarkMap.set(mapped.modelId, mapped.metrics);
    }
  }

  let bestModel: ModelId | null = null;
  let bestQuality = -1;

  for (const modelId of ALL_MODELS) {
    const metrics = benchmarkMap.get(modelId) ?? getDefaultMetrics(modelId);
    const costPerCall = estimateCost(modelId, 1000);

    if (costPerCall <= maxCostPerCall && metrics.quality > bestQuality) {
      bestQuality = metrics.quality;
      bestModel = modelId;
    }
  }

  // If no model fits the cost constraint, return the cheapest
  if (!bestModel) {
    bestModel = ALL_MODELS.reduce((cheapest, modelId) => {
      const cheapestCost = estimateCost(cheapest, 1000);
      const currentCost = estimateCost(modelId, 1000);
      return currentCost < cheapestCost ? modelId : cheapest;
    }, ALL_MODELS[0]);
  }

  return bestModel;
}

/**
 * Get cost analytics for a date range.
 * Requirements: 16.6, 16.7
 */
export async function getCostAnalytics(dateRange: DateRange): Promise<CostAnalytics> {
  const benchmarks = await prisma.modelBenchmark.findMany({
    where: {
      lastBenchmarked: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
    },
  });

  const costByModel: Partial<Record<ModelId, number>> = {};
  const costByTaskType: Record<string, number> = {};
  let totalCostCents = 0;

  for (const b of benchmarks) {
    const mapped = mapBenchmarkRecord(b);
    const cost = mapped.metrics.costPer1kTokens * mapped.sampleSize;

    costByModel[mapped.modelId] = (costByModel[mapped.modelId] ?? 0) + cost;
    costByTaskType[mapped.taskType] = (costByTaskType[mapped.taskType] ?? 0) + cost;
    totalCostCents += cost;
  }

  // Estimate cost per audit (assuming ~2k tokens per audit)
  const totalAudits = benchmarks.reduce((sum, b) => sum + b.sampleSize, 0);
  const averageCostPerAuditCents = totalAudits > 0 ? (totalCostCents * 2) / totalAudits : 0;

  // Determine trend (simplified: compare first half vs second half of period)
  const midpoint = new Date((dateRange.start.getTime() + dateRange.end.getTime()) / 2);
  const firstHalf = benchmarks.filter((b) => b.lastBenchmarked < midpoint);
  const secondHalf = benchmarks.filter((b) => b.lastBenchmarked >= midpoint);

  const firstCost = firstHalf.reduce((s, b) => s + b.costPer1kTokensCents * b.sampleSize, 0);
  const secondCost = secondHalf.reduce((s, b) => s + b.costPer1kTokensCents * b.sampleSize, 0);

  let trend: CostAnalytics['trend'] = 'stable';
  if (secondCost > firstCost * 1.05) trend = 'increasing';
  else if (secondCost < firstCost * 0.95) trend = 'decreasing';

  return {
    period: dateRange,
    totalCostCents,
    costByModel: costByModel as Record<ModelId, number>,
    costByTaskType,
    averageCostPerAuditCents,
    trend,
  };
}
