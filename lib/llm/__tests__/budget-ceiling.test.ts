// @vitest-environment node
/**
 * lib/llm/__tests__/budget-ceiling.test.ts
 *
 * Qualification for the fail-closed application-side LLM spend ceiling
 * (lib/llm/budget.ts): a configured LLM_BUDGET_MAX_CENTS refuses provider
 * calls once the ceiling would be exceeded, never lets a call through past
 * the limit, and records actual usage. AWS Budgets alerts are not hard caps —
 * this is the enforcement point.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  budgetCeilingCents,
  checkAndReserveSpend,
  __resetSpendForTests,
  getSpend,
  LlmBudgetExceededError,
  modelPricingCentsPer1k,
  recordSpend,
} from '@/lib/llm/budget';

const NOVA_MICRO = 'us.amazon.nova-micro-v1:0';
const NOVA_2_LITE = 'us.amazon.nova-2-lite-v1:0';

beforeEach(() => {
  __resetSpendForTests();
});

afterEach(() => {
  delete process.env.LLM_BUDGET_MAX_CENTS;
});

describe('LLM spend ceiling', () => {
  it('has no ceiling when the env var is unset', () => {
    delete process.env.LLM_BUDGET_MAX_CENTS;
    expect(budgetCeilingCents()).toBe(0);
    // No ceiling -> never refuses, regardless of spend.
    checkAndReserveSpend(NOVA_2_LITE, { inputTokens: 10_000_000, outputTokens: 100_000 });
    expect(getSpend().refusals).toBe(0);
  });

  it('rejects non-positive ceilings (fail open only when explicitly unset)', () => {
    process.env.LLM_BUDGET_MAX_CENTS = '0';
    expect(budgetCeilingCents()).toBe(0);
    process.env.LLM_BUDGET_MAX_CENTS = '-5';
    expect(budgetCeilingCents()).toBe(0);
    process.env.LLM_BUDGET_MAX_CENTS = 'not-a-number';
    expect(budgetCeilingCents()).toBe(0);
  });

  it('refuses the call that would exceed the ceiling (fail closed, no provider hit)', () => {
    process.env.LLM_BUDGET_MAX_CENTS = '10'; // 10 cents
    // Nova 2 Lite: 20k input * 0.03 + 40k output * 0.25 = 0.6 + 10 = 10.6 cents
    // — exceeds the 10-cent ceiling, so the call must be refused pre-provider.
    expect(() =>
      checkAndReserveSpend(NOVA_2_LITE, { inputTokens: 20_000, outputTokens: 40_000 })
    ).toThrow(LlmBudgetExceededError);
    expect(getSpend().refusals).toBe(1);
    expect(getSpend().spentCents).toBe(0); // nothing actually spent
  });

  it('allows calls inside the ceiling and accumulates actual usage', () => {
    process.env.LLM_BUDGET_MAX_CENTS = '500'; // $5.00
    checkAndReserveSpend(NOVA_MICRO, { inputTokens: 4000, outputTokens: 2000 });
    recordSpend(NOVA_MICRO, { inputTokens: 4000, outputTokens: 2000 });

    const spend = getSpend();
    expect(spend.calls).toBe(1);
    expect(spend.spentCents).toBeGreaterThan(0);
    // 4k input * 0.0035 + 2k output * 0.014 = 0.014 + 0.028 = 0.042 cents
    expect(spend.spentCents).toBeCloseTo(0.042, 3);
    expect(spend.remainingCents).toBeCloseTo(499.958, 2);
  });

  it('refuses after cumulative spend crosses the ceiling', () => {
    process.env.LLM_BUDGET_MAX_CENTS = '1'; // 1 cent
    // Spend most of the ceiling.
    recordSpend(NOVA_MICRO, { inputTokens: 200_000, outputTokens: 20_000 });
    // Micro: 200k * 0.0035 = 0.7 cents + 20k * 0.014 = 0.28 -> ~0.98 cents
    // A further 1k-input/1k-output call (~0.0175 cents) still fits; a
    // 100k-input call (~0.35 + floor) must now be refused.
    checkAndReserveSpend(NOVA_MICRO, { inputTokens: 1000, outputTokens: 1000 });
    expect(() =>
      checkAndReserveSpend(NOVA_MICRO, { inputTokens: 100_000, outputTokens: 50_000 })
    ).toThrow(LlmBudgetExceededError);
    expect(getSpend().refusals).toBe(1);
  });

  it('prices Nova 2 Lite higher than Nova Micro', () => {
    const lite = modelPricingCentsPer1k(NOVA_2_LITE);
    const micro = modelPricingCentsPer1k(NOVA_MICRO);
    expect(lite.input).toBeGreaterThan(micro.input);
    expect(lite.output).toBeGreaterThan(micro.output);
  });

  it('exposes a spend snapshot for evidence records', () => {
    process.env.LLM_BUDGET_MAX_CENTS = '100';
    recordSpend(NOVA_2_LITE, { inputTokens: 1000, outputTokens: 1000 });
    const snapshot = getSpend();
    expect(snapshot).toMatchObject({
      ceilingCents: 100,
      calls: 1,
      refusals: 0,
    });
    expect(snapshot.remainingCents).toBeLessThan(100);
  });
});
