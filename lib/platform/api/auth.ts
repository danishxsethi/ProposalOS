/**
 * Platform API Authentication
 * Implements API key validation with bcrypt hash comparison,
 * rolling window rate limiting (hourly + daily),
 * and API key CRUD operations.
 *
 * Requirements: 9.2
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import type { APIKeyConfig, APIPermission, RateLimitResult } from '@/lib/platform/types';

export const API_KEY_PREFIX = 'pe_pub_';
const BCRYPT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

export function generateRawKey(): string {
  const random = randomBytes(32).toString('hex'); // 64 chars
  return `${API_KEY_PREFIX}${random}`;
}

// ---------------------------------------------------------------------------
// In-memory rolling window rate-limit store
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number;
  windowStart: number;
}

const hourlyWindows = new Map<string, WindowEntry>();
const dailyWindows = new Map<string, WindowEntry>();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rollingIncrement(
  store: Map<string, WindowEntry>,
  key: string,
  windowMs: number
): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function rollingPeek(
  store: Map<string, WindowEntry>,
  key: string,
  windowMs: number
): number {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) return 0;
  return entry.count;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Check and increment rate limit counters for a key.
 * Returns whether the request is allowed and remaining quota.
 */
export function checkRateLimit(
  keyId: string,
  rateLimitHour: number,
  rateLimitDay: number
): RateLimitResult {
  const hourKey = `h:${keyId}`;
  const dayKey = `d:${keyId}`;

  const hourCount = rollingIncrement(hourlyWindows, hourKey, HOUR_MS);
  const dayCount = rollingIncrement(dailyWindows, dayKey, DAY_MS);

  if (hourCount > rateLimitHour) {
    const entry = hourlyWindows.get(hourKey)!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.windowStart + HOUR_MS),
    };
  }

  if (dayCount > rateLimitDay) {
    const entry = dailyWindows.get(dayKey)!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.windowStart + DAY_MS),
    };
  }

  const hourRemaining = rateLimitHour - hourCount;
  const dayRemaining = rateLimitDay - dayCount;
  const remaining = Math.min(hourRemaining, dayRemaining);
  const hourEntry = hourlyWindows.get(hourKey)!;

  return {
    allowed: true,
    remaining,
    resetAt: new Date(hourEntry.windowStart + HOUR_MS),
  };
}

/** Peek at current usage without incrementing counters */
export function peekRateLimit(
  keyId: string
): { hourUsed: number; dayUsed: number } {
  return {
    hourUsed: rollingPeek(hourlyWindows, `h:${keyId}`, HOUR_MS),
    dayUsed: rollingPeek(dailyWindows, `d:${keyId}`, DAY_MS),
  };
}

// ---------------------------------------------------------------------------
// validateAPIKey — bcrypt comparison
// ---------------------------------------------------------------------------

export interface ValidatedKey {
  keyId: string;
  tenantId: string;
  permissions: APIPermission[];
  rateLimitHour: number;
  rateLimitDay: number;
}

export async function validateAPIKey(rawKey: string): Promise<ValidatedKey | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  // Fetch candidate keys by prefix for bcrypt comparison
  const prefix = rawKey.substring(0, 10);
  const candidates = await prisma.publicAPIKey.findMany({
    where: { keyPrefix: prefix, status: 'active' },
  }).catch(() => []);

  for (const record of candidates) {
    const match = await bcrypt.compare(rawKey, record.keyHash);
    if (!match) continue;

    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Update lastUsedAt asynchronously
    prisma.publicAPIKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => null);

    const rateLimit = record.rateLimit as { requestsPerHour: number; requestsPerDay: number };

    return {
      keyId: record.id,
      tenantId: record.tenantId,
      permissions: (record.permissions ?? ['read']) as APIPermission[],
      rateLimitHour: rateLimit.requestsPerHour,
      rateLimitDay: rateLimit.requestsPerDay,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateAPIKeyInput {
  tenantId: string;
  name: string;
  permissions?: APIPermission[];
  rateLimitHour?: number;
  rateLimitDay?: number;
  expiresAt?: Date;
}

export interface CreateAPIKeyResult {
  rawKey: string; // shown once — not stored in plaintext
  config: APIKeyConfig;
}

export async function createAPIKey(input: CreateAPIKeyInput): Promise<CreateAPIKeyResult> {
  const rawKey = generateRawKey();
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const keyPrefix = rawKey.substring(0, 10);

  const rateLimitHour = input.rateLimitHour ?? 1000;
  const rateLimitDay = input.rateLimitDay ?? 10000;

  const record = await prisma.publicAPIKey.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      keyHash,
      keyPrefix,
      permissions: input.permissions ?? ['read'],
      rateLimit: { requestsPerHour: rateLimitHour, requestsPerDay: rateLimitDay },
      expiresAt: input.expiresAt ?? null,
      status: 'active',
    },
  });

  const config: APIKeyConfig = {
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    keyHash: record.keyHash,
    keyPrefix: record.keyPrefix,
    permissions: record.permissions as APIPermission[],
    rateLimit: { requestsPerHour: rateLimitHour, requestsPerDay: rateLimitDay },
    lastUsedAt: record.lastUsedAt ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    status: record.status as 'active' | 'revoked',
  };

  return { rawKey, config };
}

export async function revokeAPIKey(keyId: string, tenantId: string): Promise<boolean> {
  const result = await prisma.publicAPIKey.updateMany({
    where: { id: keyId, tenantId },
    data: { status: 'revoked' },
  });
  return result.count > 0;
}

export async function listAPIKeys(tenantId: string): Promise<APIKeyConfig[]> {
  const records = await prisma.publicAPIKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return records.map((r) => {
    const rateLimit = r.rateLimit as { requestsPerHour: number; requestsPerDay: number };
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      keyHash: r.keyHash,
      keyPrefix: r.keyPrefix,
      permissions: r.permissions as APIPermission[],
      rateLimit: {
        requestsPerHour: rateLimit.requestsPerHour,
        requestsPerDay: rateLimit.requestsPerDay,
      },
      lastUsedAt: r.lastUsedAt ?? undefined,
      expiresAt: r.expiresAt ?? undefined,
      status: r.status as 'active' | 'revoked',
    };
  });
}
