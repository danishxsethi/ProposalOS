/**
 * app/api/admin/feature-flags/route.ts
 *
 * Feature Flag Management API — super_admin only.
 * Reads/writes global feature flags (cross-tenant system data).
 * RLS bypassed intentionally; gated by withRole('super_admin'). [#7]
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, ValidationError } from '@/lib/api/errors';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

// ─── Cache ────────────────────────────────────────────────────────────────────

let flagsCache: Record<string, boolean | number | string> | null = null;
let lastCacheUpdate = 0;

const VALID_FLAG_KEYS = Object.keys(FEATURE_FLAGS);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const featureFlagSchema = z.object({
  key: z
    .string()
    .min(1, { message: 'Key is required' })
    .refine((key) => VALID_FLAG_KEYS.includes(key), {
      message: `Invalid flag key. Must be one of: ${VALID_FLAG_KEYS.join(', ')}`,
    }),
  value: z.union([z.string(), z.boolean(), z.number().int().min(0).max(100).optional()]),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getMergedFlags() {
  const now = Date.now();
  if (flagsCache && now - lastCacheUpdate < 60000) return flagsCache;

  try {
    const dbFlags = await prisma.featureFlag.findMany();
    const merged = { ...FEATURE_FLAGS } as Record<string, boolean | number | string>;
    for (const flag of dbFlags) {
      if (flag.value === 'true' || flag.value === 'false') {
        merged[flag.key] = flag.value === 'true';
      } else if (!isNaN(Number(flag.value))) {
        merged[flag.key] = parseInt(flag.value, 10);
      } else {
        merged[flag.key] = flag.value;
      }
    }
    flagsCache = merged;
    lastCacheUpdate = now;
    return merged;
  } catch {
    return FEATURE_FLAGS;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleGetFlags(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    // Feature flags are cross-tenant system data: bypass RLS, gated by super_admin role above.
    const flags = await runWithTenantBypass('admin-feature-flags-read', () => getMergedFlags());
    const response = NextResponse.json({ success: true, flags });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    return NextResponse.json(
      new InternalError('Failed to fetch feature flags', {
        originalError: error instanceof Error ? error.message : String(error),
      }).toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

async function handlePostFlags(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const body = await req.json();
    const result = featureFlagSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        new ValidationError(
          'Invalid flag data',
          result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
        ).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { key, value } = result.data;
    const newValue = String(value);

    if (key.includes('PCT') || key.includes('PERCENTAGE') || key.includes('ROLLOUT')) {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        return NextResponse.json(
          new ValidationError('Percentage flags must be between 0 and 100', [
            { field: 'value', message: 'Must be between 0 and 100' },
          ]).toEnvelope(req.url, traceId),
          { status: 400 }
        );
      }
    }

    const flag = await runWithTenantBypass('admin-feature-flags-write', async () => {
      const existing = await prisma.featureFlag.findUnique({ where: { key } });
      const oldValue = existing?.value ?? 'undefined';
      const updated = await prisma.featureFlag.upsert({
        where: { key },
        update: { value: newValue },
        create: { key, value: newValue },
      });
      logger.info(
        { event: 'feature_flag.audit', flagKey: key, oldValue, newValue, changedBy: 'super_admin' },
        'Feature flag changed'
      );
      return updated;
    });

    flagsCache = null;
    const response = NextResponse.json({ success: true, flag });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    return NextResponse.json(
      new InternalError('Failed to update feature flag', {
        originalError: error instanceof Error ? error.message : String(error),
      }).toEnvelope(req.url, traceId),
      { status: 500 }
    );
  }
}

// ─── Exports — super_admin required ───────────────────────────────────────────

const rateLimitedGet = (req: Request) =>
  withRateLimit({ windowMs: 60 * 1000, max: 30 })(req, () => handleGetFlags(req));

const rateLimitedPost = (req: Request) =>
  withRateLimit({ windowMs: 60 * 1000, max: 10 })(req, () => handlePostFlags(req));

export const GET = withRole('super_admin', rateLimitedGet);
export const POST = withRole('super_admin', rateLimitedPost);
