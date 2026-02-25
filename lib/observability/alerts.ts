/**
 * lib/observability/alerts.ts
 *
 * Task 4 (Pipeline 17): Alert Rules & Webhooks
 *
 * Defines configurable alert rules and fires POST webhooks to ALERT_WEBHOOK_URL
 * when thresholds are breached. Evaluated on every MetricsRecorder flush cycle.
 */

interface MetricEntry {
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp: Date;
}

export interface AlertRule {
    name: string;
    metric: string;
    /** Aggregation window for rate-based rules (ms). Null = per-flush evaluation. */
    windowMs: number | null;
    threshold: number;
    /** 'gt' = greater than, 'lt' = less than */
    condition: 'gt' | 'lt';
    /** Human-readable description of what the threshold means */
    description: string;
}

// ─── Rule Definitions ─────────────────────────────────────────────────────────

export const ALERT_RULES: AlertRule[] = [
    {
        name: 'llm_daily_cost_too_high',
        metric: 'llm_cost_total',
        windowMs: 24 * 60 * 60 * 1000, // 1 day
        threshold: 50.0, // $50 USD
        condition: 'gt',
        description: 'LLM spend exceeded $50 in the last 24 hours',
    },
    {
        name: 'qa_hallucination_rate_high',
        metric: 'qa_hallucination_rate',
        windowMs: null, // Evaluate each individual metric value
        threshold: 0.2,
        condition: 'gt',
        description: 'QA hallucination rate exceeded 20%',
    },
    {
        name: 'audit_failures_too_high',
        metric: 'audit_failures_total',
        windowMs: 60 * 60 * 1000, // 1 hour
        threshold: 10,
        condition: 'gt',
        description: 'More than 10 audit failures in the last hour',
    },
];

// ─── In-memory rolling window accumulator for rate-based rules ────────────────

interface WindowEntry { value: number; ts: number }
const windowAccumulators: Record<string, WindowEntry[]> = {};

function accumulateAndSum(metric: string, value: number, windowMs: number): number {
    const now = Date.now();
    if (!windowAccumulators[metric]) windowAccumulators[metric] = [];
    windowAccumulators[metric].push({ value, ts: now });
    // Prune out-of-window entries
    windowAccumulators[metric] = windowAccumulators[metric].filter(
        (e) => now - e.ts <= windowMs
    );
    return windowAccumulators[metric].reduce((s, e) => s + e.value, 0);
}

// ─── Webhook Firing ───────────────────────────────────────────────────────────

async function fireWebhook(rule: AlertRule, observedValue: number): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn(`[Alerts] ${rule.name} triggered (${observedValue}) but ALERT_WEBHOOK_URL not set`);
        return;
    }

    const payload = {
        alert: rule.name,
        description: rule.description,
        metric: rule.metric,
        threshold: rule.threshold,
        observedValue,
        condition: rule.condition,
        firedAt: new Date().toISOString(),
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        console.info(`[Alerts] Fired webhook for rule "${rule.name}" (value=${observedValue})`);
    } catch (err) {
        console.error(`[Alerts] Webhook failed for rule "${rule.name}":`, err);
    }
}

// ─── Rule Evaluator (called by MetricsRecorder on flush) ─────────────────────

export async function checkAlertRules(batch: MetricEntry[]): Promise<void> {
    // Deduplicate firing within a flush — only fire each rule once per flush
    const firedRules = new Set<string>();

    for (const rule of ALERT_RULES) {
        if (firedRules.has(rule.name)) continue;

        const matchingEntries = batch.filter((m) => m.name === rule.metric);
        if (matchingEntries.length === 0) continue;

        let effectiveValue: number;

        if (rule.windowMs !== null) {
            // Rate-based: accumulate into rolling window
            const batchSum = matchingEntries.reduce((s, m) => s + m.value, 0);
            effectiveValue = accumulateAndSum(rule.metric, batchSum, rule.windowMs);
        } else {
            // Per-value: check max value in this flush batch
            effectiveValue = Math.max(...matchingEntries.map((m) => m.value));
        }

        const breached =
            rule.condition === 'gt'
                ? effectiveValue > rule.threshold
                : effectiveValue < rule.threshold;

        if (breached) {
            firedRules.add(rule.name);
            await fireWebhook(rule, effectiveValue);
        }
    }
}
