/**
 * lib/costs/redisSpendTracker.ts
 *
 * Redis-backed global spend tracker — replaces the in-memory singleton
 * GlobalSpendTracker for cross-instance spend cap enforcement.
 *
 * Design:
 * - Atomic check-and-increment via Lua script (no race between read + write)
 * - TTL-based reset: monthly key expires at end of billing period,
 *   daily key expires at end of day (UTC midnight)
 * - Redis-down policy: FAIL-CLOSED with conservative local sub-cap fallback
 *   (blocks spend rather than allowing overspend; does NOT take down all audits)
 *
 * Key schema:
 *   spend:{tenantId}:monthly:{YYYY-MM}  → float (cents)
 *   spend:{tenantId}:daily:{YYYY-MM-DD} → int (audit count)
 *
 * [#8]
 */

import { logger } from '@/lib/logger';
import { getSharedStore, SharedStore } from '@/lib/store/shared';

import { TenantTier, TIER_BUDGETS } from './costTracker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpendCheckResult {
  allowed: boolean;
  currentSpendCents: number;
  capCents: number;
  reason?: string;
}

export interface DailyLimitResult {
  allowed: boolean;
  todayCount: number;
  limit: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Conservative local sub-cap used when Redis is unreachable.
 * Each instance can spend up to this fraction of the tier budget independently.
 * With N instances, worst-case overspend is N * LOCAL_FALLBACK_FRACTION * budget.
 * Default 10% — with 5 instances, worst-case 50% of budget before Redis recovers.
 */
const LOCAL_FALLBACK_FRACTION = 0.1;

/**
 * Per-instance in-memory spend counters used ONLY during Redis outage.
 * Reset when Redis recovers (spend is re-read from Redis as source of truth).
 */
const localFallbackSpend = new Map<string, number>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Atomic check-and-increment monthly spend for a tenant.
 *
 * Returns { allowed: true } if the increment would not exceed the tier's
 * monthly budget. The check + increment is atomic (Lua script in Redis) so
 * concurrent instances cannot race past the cap.
 *
 * Redis-down: falls back to a conservative per-instance local cap
 * (LOCAL_FALLBACK_FRACTION * budget). Logged as a degraded-mode event.
 */
export async function checkAndAddSpend(
  tenantId: string,
  amountCents: number,
  tier: TenantTier
): Promise<SpendCheckResult> {
  const budget = TIER_BUDGETS[tier];
  const capCents = budget.monthlyBudgetCents;

  // Key: spend:{tenantId}:monthly:2026-06
  const now = new Date();
  const monthKey = `spend:${tenantId}:monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // TTL: seconds until end of current month (UTC)
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ttlSeconds = Math.max(1, Math.floor((endOfMonth.getTime() - now.getTime()) / 1000));

  try {
    const store = await getSharedStore();
    const { allowed, newValue } = await store.checkAndIncrementFloat(
      monthKey,
      amountCents,
      capCents,
      ttlSeconds
    );

    // Clear local fallback on successful Redis access (Redis is source of truth)
    localFallbackSpend.delete(tenantId);

    if (!allowed) {
      logger.warn(
        { tenantId, tier, currentSpend: newValue, cap: capCents, attempted: amountCents },
        '[SpendTracker] Monthly budget exceeded — blocking'
      );
    }

    return { allowed, currentSpendCents: newValue, capCents };
  } catch (error) {
    // Redis unavailable — use conservative local fallback
    return handleRedisDown(tenantId, amountCents, capCents, error);
  }
}

/**
 * Atomic check-and-increment daily audit count for a tenant.
 */
export async function checkAndIncrementDailyAudit(
  tenantId: string,
  tier: TenantTier
): Promise<DailyLimitResult> {
  const budget = TIER_BUDGETS[tier];
  const limit = budget.maxAuditsPerDay;

  const now = new Date();
  const dayKey = `spend:${tenantId}:daily:${now.toISOString().slice(0, 10)}`;

  // TTL: seconds until UTC midnight
  const endOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const ttlSeconds = Math.max(1, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));

  try {
    const store = await getSharedStore();
    const count = await store.increment(dayKey, ttlSeconds);

    return {
      allowed: count <= limit,
      todayCount: count,
      limit,
    };
  } catch (error) {
    // Redis down — allow with warning (daily limit is a soft guardrail,
    // not a cost-integrity hard cap; the monthly budget is the hard cap)
    logger.warn(
      { tenantId, error: error instanceof Error ? error.message : 'Unknown' },
      '[SpendTracker] Redis unavailable for daily limit — allowing (soft guardrail)'
    );
    return { allowed: true, todayCount: -1, limit };
  }
}

/**
 * Read current monthly spend for a tenant (non-mutating).
 * Returns 0 if key doesn't exist or Redis is down.
 */
export async function getCurrentMonthlySpend(tenantId: string): Promise<number> {
  const now = new Date();
  const monthKey = `spend:${tenantId}:monthly:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  try {
    const store = await getSharedStore();
    const val = await store.get(monthKey);
    return val ? parseFloat(val) : 0;
  } catch {
    return 0;
  }
}

/**
 * Read current daily audit count for a tenant.
 */
export async function getCurrentDailyAuditCount(tenantId: string): Promise<number> {
  const now = new Date();
  const dayKey = `spend:${tenantId}:daily:${now.toISOString().slice(0, 10)}`;

  try {
    const store = await getSharedStore();
    const val = await store.get(dayKey);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

// ─── Redis-down fallback (fail-closed with local sub-cap) ────────────────────

function handleRedisDown(
  tenantId: string,
  amountCents: number,
  capCents: number,
  error: unknown
): SpendCheckResult {
  const localCap = capCents * LOCAL_FALLBACK_FRACTION;
  const currentLocal = localFallbackSpend.get(tenantId) ?? 0;
  const newLocal = currentLocal + amountCents;

  logger.warn(
    {
      tenantId,
      localCap,
      currentLocal,
      amountCents,
      redisError: error instanceof Error ? error.message : 'Unknown',
    },
    '[SpendTracker] REDIS DOWN — using conservative local fallback (fail-closed)'
  );

  if (newLocal > localCap) {
    // Fail-closed: block spend at local sub-cap
    return {
      allowed: false,
      currentSpendCents: currentLocal,
      capCents,
      reason: `Redis unavailable; local fallback cap (${localCap} cents) exceeded`,
    };
  }

  // Allow under local sub-cap — track locally
  localFallbackSpend.set(tenantId, newLocal);
  return { allowed: true, currentSpendCents: newLocal, capCents };
}

/**
 * Reset local fallback counters (for testing).
 */
export function _resetLocalFallback(): void {
  localFallbackSpend.clear();
}
