/**
 * lib/costs/errors.ts
 *
 * Task 2 (Pipeline 16): Hard cost cap enforcement errors.
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
