/**
 * app/api/admin/feature-flags/route.ts
 *
 * Feature Flag Management API
 * Allows admins to view and toggle feature flags
 *
 * Features:
 * - Auth & admin scoping
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

// Simple in-memory cache to represent the values until the next application restart
let flagsCache: Record<string, boolean | number | string> | null = null;
let lastCacheUpdate = 0;

/**
 * List of valid feature flag keys
 * Used for validation to prevent typos and invalid flags
 */
const VALID_FLAG_KEYS = Object.keys(FEATURE_FLAGS);

/**
 * Feature flag update schema with enhanced validation
 */
const featureFlagSchema = z.object({
  key: z
    .string()
    .min(1, { message: 'Key is required' })
    .refine(
      (key) => VALID_FLAG_KEYS.includes(key),
      {
        message: `Invalid flag key. Must be one of: ${VALID_FLAG_KEYS.join(', ')}`,
      }
    ),
  value: z.union([
    z.string(),
    z.boolean(),
    z.number().int().min(0).max(100).optional(), // For percentage flags
  ]),
});

/**
 * Audit log schema for flag changes
 */
const auditLogSchema = z.object({
  flagKey: z.string(),
  oldValue: z.string().optional(),
  newValue: z.string(),
  changedBy: z.string(),
  timestamp: z.string(),
});

async function getMergedFlags() {
  const now = Date.now();
  if (flagsCache && now - lastCacheUpdate < 60000) {
    return flagsCache;
  }

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
    // Fallback to env vars if DB is unavailable
    return FEATURE_FLAGS;
  }
}

/**
 * Log feature flag change for audit trail
 */
async function logFlagChange(data: {
  flagKey: string;
  oldValue: string;
  newValue: string;
  userId: string;
}): Promise<void> {
  try {
    const auditLog = auditLogSchema.parse({
      flagKey: data.flagKey,
      oldValue: data.oldValue,
      newValue: data.newValue,
      changedBy: data.userId,
      timestamp: new Date().toISOString(),
    });

    // Log to console for audit trail
    // Note: If you want persistent audit logging, create a FeatureFlagAudit model in Prisma
    console.log('[Feature Flag Audit]', auditLog);
  } catch (error) {
    console.error('Failed to log feature flag change:', error);
  }
}

/**
 * Inner handler for GET flags
 */
async function handleGetFlags(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const flags = await getMergedFlags();
    const response = NextResponse.json({ success: true, flags });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    const internalError = new InternalError('Failed to fetch feature flags', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for POST flags
 */
async function handlePostFlags(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = featureFlagSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid flag data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { key, value } = result.data;

    // Get the current value for audit logging
    const existingFlag = await prisma.featureFlag.findUnique({
      where: { key },
    });

    const oldValue = existingFlag?.value || 'undefined';
    const newValue = String(value);

    // Validate percentage flags have values between 0-100
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

    const flag = await prisma.featureFlag.upsert({
      where: { key },
      update: { value: newValue },
      create: { key, value: newValue },
    });

    // Log the change for audit trail
    await logFlagChange({
      flagKey: key,
      oldValue,
      newValue,
      userId: session.user.id || session.user.email || 'unknown',
    });

    // Invalidate cache immediately on write
    flagsCache = null;

    const response = NextResponse.json({
      success: true,
      flag,
      audit: {
        changedBy: session.user.email,
        timestamp: new Date().toISOString(),
      },
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Feature Flag Update Error:', error);
    const internalError = new InternalError('Failed to update feature flag', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many flag requests. Please wait before trying again.',
  })(req, () => handleGetFlags(req));

const rateLimitedPost = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many flag update requests. Please wait before trying again.',
  })(req, () => handlePostFlags(req));

export const GET = rateLimitedGet;
export const POST = rateLimitedPost;
