// Cost budget configuration
export const COST_CONFIG = {
    // Default threshold in cents (50 cents = $0.50)
    DEFAULT_THRESHOLD_CENTS: parseInt(process.env.AUDIT_COST_THRESHOLD_CENTS || '50'),

    // Warning levels
    WARNING_THRESHOLD: 0.8, // 80% of budget
    CRITICAL_THRESHOLD: 1.0, // 100% of budget

    // Color coding
    SAFE_COLOR: 'var(--status-success)',
    WARNING_COLOR: 'var(--status-warning)',
    CRITICAL_COLOR: 'var(--status-error)',
};

export function getCostStatus(costCents: number) {
    const threshold = COST_CONFIG.DEFAULT_THRESHOLD_CENTS;
    const ratio = costCents / threshold;

    if (ratio >= COST_CONFIG.CRITICAL_THRESHOLD) {
        return {
            level: 'critical' as const,
            color: COST_CONFIG.CRITICAL_COLOR,
            message: `⚠️ Cost exceeded budget by $${((costCents - threshold) / 100).toFixed(2)}`,
            ratio,
        };
    }

    if (ratio >= COST_CONFIG.WARNING_THRESHOLD) {
        return {
            level: 'warning' as const,
            color: COST_CONFIG.WARNING_COLOR,
            message: `⚡ Approaching budget limit (${(ratio * 100).toFixed(0)}%)`,
            ratio,
        };
    }

    return {
        level: 'safe' as const,
        color: COST_CONFIG.SAFE_COLOR,
        message: null,
        ratio,
    };
}

export function formatCost(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}
