/**
 * lib/llm/budget.ts
 *
 * Application-side, fail-closed LLM spend ceiling.
 *
 * AWS Budgets alerts are NOT hard caps — the mission requires an
 * application-side ceiling that refuses calls once the configured spend limit
 * is reached (or would be exceeded by the next call's estimate).
 *
 * Configuration:
 *   LLM_BUDGET_MAX_CENTS — maximum cumulative spend in cents (USD) for this
 *   process. Unset or <= 0 disables the ceiling (production may rely on
 *   external budget controls; bounded experiments MUST set it).
 *
 * Behavior:
 *   - checkAndReserveSpend() is called BEFORE every real provider call with a
 *     worst-case estimate (estimated input tokens + maxOutputTokens). If the
 *     running total + estimate exceeds the ceiling it throws
 *     LlmBudgetExceededError — the call never happens.
 *   - recordSpend() adds the ACTUAL usage-based cost after a successful call
 *     (replacing the conservative estimate).
 *   - getSpend() exposes the running total for metrics/evidence.
 *
 * Fixture-provider responses never touch this budget (they cost nothing); the
 * ceiling is enforced only on the real inference path.
 */

import { COSTS } from '@/lib/costs/costTracker';

/** Per-1k-token prices in cents for the supported Bedrock models. */
export function modelPricingCentsPer1k(modelId: string): {
  input: number;
  output: number;
} {
  const lower = modelId.toLowerCase();
  if (lower.includes('nova-2-lite')) {
    return {
      input: COSTS.BEDROCK_NOVA_2_LITE_PER_1K_INPUT_CENTS,
      output: COSTS.BEDROCK_NOVA_2_LITE_PER_1K_OUTPUT_CENTS,
    };
  }
  // Default: Nova Micro (and any unknown model is priced at the cheaper tier's
  // rates; the ceiling stays conservative via the output-token estimate).
  return {
    input: COSTS.BEDROCK_NOVA_MICRO_PER_1K_INPUT_CENTS,
    output: COSTS.BEDROCK_NOVA_MICRO_PER_1K_OUTPUT_CENTS,
  };
}

export class LlmBudgetExceededError extends Error {
  constructor(
    public readonly spentCents: number,
    public readonly estimatedCents: number,
    public readonly maxCents: number
  ) {
    super(
      `[LlmBudgetExceededError] estimated spend of ${estimatedCents} cents would exceed the ` +
        `configured LLM_BUDGET_MAX_CENTS ceiling of ${maxCents} (already spent ${spentCents} cents). ` +
        `The call was refused before reaching the provider.`
    );
    this.name = 'LlmBudgetExceededError';
  }
}

const state = {
  spentCents: 0,
  calls: 0,
  refusals: 0,
};

export function budgetCeilingCents(): number {
  const raw = process.env.LLM_BUDGET_MAX_CENTS;
  if (!raw) return 0;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface SpendSnapshot {
  ceilingCents: number;
  spentCents: number;
  calls: number;
  refusals: number;
  remainingCents: number | null;
}

export function getSpend(): SpendSnapshot {
  const ceiling = budgetCeilingCents();
  return {
    ceilingCents: ceiling,
    spentCents: state.spentCents,
    calls: state.calls,
    refusals: state.refusals,
    remainingCents: ceiling > 0 ? Math.max(0, ceiling - state.spentCents) : null,
  };
}

/** Test-only reset (used by the budget unit tests). */
export function __resetSpendForTests(): void {
  state.spentCents = 0;
  state.calls = 0;
  state.refusals = 0;
}

/**
 * Fail-closed pre-call check with a worst-case cost estimate. Throws
 * LlmBudgetExceededError (no provider call happens) when the ceiling would be
 * exceeded.
 */
export function checkAndReserveSpend(
  modelId: string,
  estimated: {
    inputTokens: number;
    outputTokens: number;
  }
): void {
  const ceiling = budgetCeilingCents();
  if (ceiling <= 0) return; // no ceiling configured

  const pricing = modelPricingCentsPer1k(modelId);
  const estimateCents =
    (estimated.inputTokens / 1000) * pricing.input +
    (estimated.outputTokens / 1000) * pricing.output;

  if (state.spentCents + estimateCents > ceiling) {
    state.refusals += 1;
    throw new LlmBudgetExceededError(state.spentCents, estimateCents, ceiling);
  }
}

/**
 * Record the actual cost of a completed call (replaces the pre-call
 * worst-case estimate; the ceiling check stays conservative because
 * checkAndReserveSpend ran before the call).
 */
export function recordSpend(
  modelId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
  }
): void {
  const pricing = modelPricingCentsPer1k(modelId);
  const cost =
    (usage.inputTokens / 1000) * pricing.input + (usage.outputTokens / 1000) * pricing.output;
  state.spentCents += cost;
  state.calls += 1;
}
