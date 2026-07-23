/**
 * Unit tests for Self-Healing Pipeline
 *
 * Requirements: 14.3, 14.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDeliverabilityDrop,
  handleAPIFailure,
  handleLatencySpike,
  getAutomatedRemediationRate,
} from '../selfHealing';

// ── Mock Prisma ────────────────────────────────────────────────────────────────

const emailDomains: Record<string, unknown>[] = [];
const anomalyLogs: Record<string, unknown>[] = [];

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      emailDomainHealth: {
        findFirst: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> } = {}) => {
          let results = [...emailDomains];
          if (where?.status) results = results.filter((d) => d.status === where.status);
          if (orderBy?.reputation === 'desc') {
            results = results.sort((a, b) => (b.reputation as number) - (a.reputation as number));
          }
          return results[0] ?? null;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          let count = 0;
          for (const d of emailDomains) {
            let match = true;
            if (where.status && d.status !== where.status) match = false;
            if (where.sentToday && typeof where.sentToday === 'object') {
              const cond = where.sentToday as Record<string, unknown>;
              if ('gt' in cond && (d.sentToday as number) <= (cond.gt as number)) match = false;
            }
            if (match) {
              Object.assign(d, data);
              count++;
            }
          }
          return { count };
        }),
      },
      verticalPlaybook: {
        findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          return null; // default: no playbook found
        }),
        update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          return { id: where.id, ...data };
        }),
      },
      anomalyLog: {
        count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
          let results = [...anomalyLogs];
          if (where?.status) results = results.filter((l) => l.status === where.status);
          if (where?.detectedAt) {
            const cond = where.detectedAt as Record<string, unknown>;
            if ('gte' in cond) {
              results = results.filter((l) => (l.detectedAt as Date) >= (cond.gte as Date));
            }
          }
          return results.length;
        }),
      },
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetDomains() {
  emailDomains.length = 0;
}

function resetAnomalyLogs() {
  anomalyLogs.length = 0;
}

function addDomain(domain: string, status: string, reputation: number, sentToday = 0) {
  emailDomains.push({ id: `domain-${domain}`, domain, status, reputation, sentToday });
}

function addAnomalyLog(status: string, detectedAt: Date = new Date()) {
  anomalyLogs.push({ id: `log-${Date.now()}-${Math.random()}`, status, detectedAt });
}

// ── handleDeliverabilityDrop ───────────────────────────────────────────────────

describe('handleDeliverabilityDrop', () => {
  beforeEach(() => {
    resetDomains();
    vi.clearAllMocks();
  });

  it('returns success without rotation when bounce rate is within threshold (≤5%)', async () => {
    const result = await handleDeliverabilityDrop(0.04);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('returns success without rotation when bounce rate is exactly at threshold (5%)', async () => {
    const result = await handleDeliverabilityDrop(0.05);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('triggers domain rotation when bounce rate exceeds 5% threshold', async () => {
    addDomain('healthy1.com', 'healthy', 90, 100);

    const result = await handleDeliverabilityDrop(0.06);

    expect(result.success).toBe(true);
    expect(result.action.type).toBe('rotate_domains');
    expect(result.notes).toContain('healthy1.com');
  });

  it('rotates to the domain with highest reputation', async () => {
    addDomain('low-rep.com', 'healthy', 60, 50);
    addDomain('high-rep.com', 'healthy', 95, 50);

    const result = await handleDeliverabilityDrop(0.10);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('high-rep.com');
  });

  it('returns failure when no healthy domains are available', async () => {
    // No domains added — none available
    const result = await handleDeliverabilityDrop(0.10);

    expect(result.success).toBe(false);
    expect(result.action.type).toBe('rotate_domains');
    expect(result.notes).toContain('No healthy domains available');
  });

  it('marks previously active domains as flagged after rotation', async () => {
    addDomain('active.com', 'healthy', 80, 200);
    addDomain('backup.com', 'healthy', 90, 0);

    const { prisma } = await import('@/lib/prisma');
    await handleDeliverabilityDrop(0.08);

    expect(prisma.emailDomainHealth.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'flagged' }),
      })
    );
  });

  it('returns completedAt as a Date', async () => {
    const result = await handleDeliverabilityDrop(0.03);
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});

// ── handleAPIFailure ───────────────────────────────────────────────────────────

describe('handleAPIFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success without failover when error rate is within threshold (≤10%)', async () => {
    const result = await handleAPIFailure('openai', 0.08);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('returns success without failover when error rate is exactly at threshold (10%)', async () => {
    const result = await handleAPIFailure('openai', 0.10);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('triggers failover when error rate exceeds 10% threshold', async () => {
    const result = await handleAPIFailure('openai', 0.15);

    expect(result.success).toBe(true);
    expect(result.action.type).toBe('switch_api_provider');
  });

  it('switches openai to anthropic when error rate exceeds threshold', async () => {
    const result = await handleAPIFailure('openai', 0.20);

    expect(result.success).toBe(true);
    expect(result.action).toMatchObject({
      type: 'switch_api_provider',
      config: { fallbackProvider: 'anthropic' },
    });
    expect(result.notes).toContain('openai');
    expect(result.notes).toContain('anthropic');
  });

  it('switches anthropic to openai as fallback', async () => {
    const result = await handleAPIFailure('anthropic', 0.15);

    expect(result.action.config).toMatchObject({ fallbackProvider: 'openai' });
  });

  it('switches sendgrid to mailgun as fallback', async () => {
    const result = await handleAPIFailure('sendgrid', 0.12);

    expect(result.action.config).toMatchObject({ fallbackProvider: 'mailgun' });
  });

  it('switches mailgun to sendgrid as fallback', async () => {
    const result = await handleAPIFailure('mailgun', 0.11);

    expect(result.action.config).toMatchObject({ fallbackProvider: 'sendgrid' });
  });

  it('returns failure when no fallback provider is configured', async () => {
    const result = await handleAPIFailure('unknown-provider', 0.50);

    expect(result.success).toBe(false);
    expect(result.notes).toContain('No fallback provider available');
  });

  it('includes error rate in notes when failover is triggered', async () => {
    const result = await handleAPIFailure('openai', 0.25);

    expect(result.notes).toContain('25.0%');
  });

  it('returns completedAt as a Date', async () => {
    const result = await handleAPIFailure('openai', 0.05);
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});

// ── handleLatencySpike ─────────────────────────────────────────────────────────

describe('handleLatencySpike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success without scaling when latency is within threshold (≤500ms)', async () => {
    const result = await handleLatencySpike('audit', 400);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('returns success without scaling when latency is exactly at threshold (500ms)', async () => {
    const result = await handleLatencySpike('audit', 500);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('within threshold');
  });

  it('triggers read replica scaling when p95 latency exceeds 500ms', async () => {
    const result = await handleLatencySpike('audit', 600);

    expect(result.success).toBe(true);
    expect(result.notes).toContain('scaling');
  });

  it('includes the stage name in the scaling notes', async () => {
    const result = await handleLatencySpike('proposal-generation', 750);

    expect(result.notes).toContain('proposal-generation');
  });

  it('includes the p95 latency value in the scaling notes', async () => {
    const result = await handleLatencySpike('email-delivery', 1200);

    expect(result.notes).toContain('1200');
  });

  it('returns action type pause_stage', async () => {
    const result = await handleLatencySpike('audit', 800);

    expect(result.action.type).toBe('pause_stage');
  });

  it('returns completedAt as a Date', async () => {
    const result = await handleLatencySpike('audit', 300);
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});

// ── getAutomatedRemediationRate ────────────────────────────────────────────────

describe('getAutomatedRemediationRate', () => {
  beforeEach(() => {
    resetAnomalyLogs();
    vi.clearAllMocks();
  });

  it('returns 1 (100%) when there are no anomalies in the last 24 hours', async () => {
    const rate = await getAutomatedRemediationRate();

    expect(rate).toBe(1);
  });

  it('returns 1 (100%) when all anomalies are resolved', async () => {
    const now = new Date();
    addAnomalyLog('resolved', now);
    addAnomalyLog('resolved', now);
    addAnomalyLog('resolved', now);

    const rate = await getAutomatedRemediationRate();

    expect(rate).toBe(1);
  });

  it('returns 0 when no anomalies are resolved', async () => {
    const now = new Date();
    addAnomalyLog('detected', now);
    addAnomalyLog('escalated', now);

    const rate = await getAutomatedRemediationRate();

    expect(rate).toBe(0);
  });

  it('calculates correct rate for partial resolution', async () => {
    const now = new Date();
    addAnomalyLog('resolved', now);
    addAnomalyLog('resolved', now);
    addAnomalyLog('resolved', now);
    addAnomalyLog('escalated', now);
    addAnomalyLog('detected', now);

    const rate = await getAutomatedRemediationRate();

    expect(rate).toBeCloseTo(0.6, 5);
  });

  it('returns a value between 0 and 1', async () => {
    const now = new Date();
    addAnomalyLog('resolved', now);
    addAnomalyLog('detected', now);

    const rate = await getAutomatedRemediationRate();

    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it('only counts anomalies from the last 24 hours', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

    // Old unresolved anomaly — should not count
    addAnomalyLog('detected', old);
    // Recent resolved anomaly
    addAnomalyLog('resolved', now);

    const { prisma } = await import('@/lib/prisma');

    // Verify the count calls use a 24h window
    await getAutomatedRemediationRate();

    expect(prisma.anomalyLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          detectedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });
});
