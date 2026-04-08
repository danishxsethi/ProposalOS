/**
 * lib/costs/errors.ts
 *
 * Task 2 (Pipeline 16): Hard cost cap enforcement errors.
 * Phase Y: Tenant budget enforcement errors.
 */

export class CostCapExceededError extends Error {
  constructor(
    public readonly totalCents: number,
    public readonly capCents: number,
    public readonly auditId?: string
  ) {
    super(
      `[CostCapExceededError] Audit cost $${(totalCents / 100).toFixed(2)} exceeded cap of $${(capCents / 100).toFixed(2)}${auditId ? ` for auditId=${auditId}` : ''}`
    );
    this.name = 'CostCapExceededError';
  }
}

/**
 * Phase Y: Tenant budget exceeded error
 * Thrown when tenant monthly budget is exceeded
 */
export class TenantBudgetExceededError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly spendCents: number,
    public readonly budgetCents: number,
    public readonly period: 'daily' | 'monthly' = 'monthly'
  ) {
    super(
      `[TenantBudgetExceededError] Tenant ${tenantId} ${period} budget exceeded: $${(spendCents / 100).toFixed(2)} spent vs $${(budgetCents / 100).toFixed(2)} budget`
    );
    this.name = 'TenantBudgetExceededError';
  }
}
