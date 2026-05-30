/**
 * lib/observability/alerts.ts
 *
 * Task 4 (Pipeline 17): Alert Rules & Webhooks
 *
 * Defines configurable alert rules and fires POST webhooks to ALERT_WEBHOOK_URL
 * when thresholds are breached. Evaluated on every MetricsRecorder flush cycle.
 */
import { logger } from '@/lib/logger';

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
  /** Alert tier: P0 (immediate page), P1 (notify within 15 min), P2 (daily digest) */
  tier: 'P0' | 'P1' | 'P2';
}

// ─── Rule Definitions ─────────────────────────────────────────────────────────

export const ALERT_RULES: AlertRule[] = [
  // ─── P0: Immediate Page ──────────────────────────────────────────────────────
  {
    name: 'api_error_rate_high',
    metric: 'api_error_rate',
    windowMs: null,
    threshold: 0.01,
    condition: 'gt',
    description: 'API error rate exceeded 1%',
    tier: 'P0',
  },
  {
    name: 'audit_pipeline_broken',
    metric: 'audit_failure_rate',
    windowMs: null,
    threshold: 0.05,
    condition: 'gt',
    description: 'Audit pipeline broken - failure rate exceeded 5%',
    tier: 'P0',
  },
  {
    name: 'service_down',
    metric: 'health_check_failures',
    windowMs: 5 * 60 * 1000, // 5 minutes
    threshold: 3,
    condition: 'gt',
    description: 'Service down - multiple health check failures',
    tier: 'P0',
  },
  // ─── P1: Notify Within 15 Minutes ────────────────────────────────────────────
  {
    name: 'llm_daily_cost_too_high',
    metric: 'llm_cost_total',
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    threshold: 50.0, // $50 USD
    condition: 'gt',
    description: 'LLM spend exceeded $50 in the last 24 hours',
    tier: 'P1',
  },
  {
    name: 'gemini_api_key_expired',
    metric: 'gemini_auth_failures',
    windowMs: 15 * 60 * 1000, // 15 minutes
    threshold: 5,
    condition: 'gt',
    description: 'Gemini API key expired or invalid - multiple auth failures',
    tier: 'P1',
  },
  {
    name: 'qa_hallucination_rate_high',
    metric: 'qa_hallucination_rate',
    windowMs: null, // Evaluate each individual metric value
    threshold: 0.2,
    condition: 'gt',
    description: 'QA hallucination rate exceeded 20%',
    tier: 'P1',
  },
  {
    name: 'audit_quality_degradation',
    metric: 'audit_quality_score',
    windowMs: 60 * 60 * 1000, // 1 hour
    threshold: 70,
    condition: 'lt',
    description: 'Audit quality degradation - average score below 70',
    tier: 'P1',
  },
  {
    name: 'email_deliverability_drop',
    metric: 'email_deliverability_rate',
    windowMs: 60 * 60 * 1000, // 1 hour
    threshold: 0.95,
    condition: 'lt',
    description: 'Email deliverability dropped below 95%',
    tier: 'P1',
  },
  {
    name: 'audit_failures_too_high',
    metric: 'audit_failures_total',
    windowMs: 60 * 60 * 1000, // 1 hour
    threshold: 10,
    condition: 'gt',
    description: 'More than 10 audit failures in the last hour',
    tier: 'P1',
  },
  {
    name: 'queue_backlog_high',
    metric: 'queue_backlog',
    windowMs: null,
    threshold: 100,
    condition: 'gt',
    description: 'Batch or worker queue backlog exceeded threshold',
    tier: 'P1',
  },
  {
    name: 'email_bounce_rate_high',
    metric: 'email_bounce_rate',
    windowMs: null,
    threshold: 0.05,
    condition: 'gt',
    description: 'Email bounce rate exceeded 5%',
    tier: 'P1',
  },
  // ─── P2: Daily Digest ────────────────────────────────────────────────────────
  {
    name: 'cost_anomaly_detected',
    metric: 'daily_cost_usd',
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    threshold: 100.0, // $100 USD
    condition: 'gt',
    description: 'Daily cost anomaly - spend exceeded $100',
    tier: 'P2',
  },
  {
    name: 'cert_expiry_warning',
    metric: 'ssl_cert_days_remaining',
    windowMs: null,
    threshold: 30,
    condition: 'lt',
    description: 'SSL certificate expires in less than 30 days',
    tier: 'P2',
  },
  {
    name: 'llm_latency_high',
    metric: 'llm_latency_p95',
    windowMs: 60 * 60 * 1000, // 1 hour
    threshold: 5000, // 5 seconds
    condition: 'gt',
    description: 'LLM latency P95 exceeded 5 seconds',
    tier: 'P2',
  },
  {
    name: 'database_connections_high',
    metric: 'db_connection_utilization',
    windowMs: null,
    threshold: 0.8, // 80%
    condition: 'gt',
    description: 'Database connection pool utilization above 80%',
    tier: 'P2',
  },
  {
    name: 'storage_growth_warning',
    metric: 'storage_used_gb',
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    threshold: 80, // 80 GB
    condition: 'gt',
    description: 'Storage usage exceeded 80 GB',
    tier: 'P2',
  },
];

// ─── In-memory rolling window accumulator for rate-based rules ────────────────

interface WindowEntry {
  value: number;
  ts: number;
}
const windowAccumulators: Record<string, WindowEntry[]> = {};

function accumulateAndSum(metric: string, value: number, windowMs: number): number {
  const now = Date.now();
  if (!windowAccumulators[metric]) windowAccumulators[metric] = [];
  windowAccumulators[metric].push({ value, ts: now });
  // Prune out-of-window entries
  windowAccumulators[metric] = windowAccumulators[metric].filter((e) => now - e.ts <= windowMs);
  return windowAccumulators[metric].reduce((s, e) => s + e.value, 0);
}

// ─── Webhook Firing ───────────────────────────────────────────────────────────

async function fireWebhook(rule: AlertRule, observedValue: number): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn({ rule: rule.name, observedValue }, `[Alerts] triggered but ALERT_WEBHOOK_URL not set`);
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
    logger.info({ rule: rule.name, observedValue }, '[Alerts] Fired webhook');
  } catch (err) {
    logger.error({ rule: rule.name, error: err }, '[Alerts] Webhook failed');
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
      rule.condition === 'gt' ? effectiveValue > rule.threshold : effectiveValue < rule.threshold;

    if (breached) {
      firedRules.add(rule.name);
      await fireWebhook(rule, effectiveValue);
    }
  }
}
