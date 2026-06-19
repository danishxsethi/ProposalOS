/**
 * app/api/pipeline/config/route.ts
 *
 * Pipeline Configuration API
 *
 * GET: Read current pipeline configuration
 * PUT: Update pipeline configuration with validation
 *
 * Features:
 * - Auth & tenant scoping
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import {
  getPipelineConfig,
  getTenantConfig,
  type PipelineConfigInput,
  upsertPipelineConfig,
} from '@/lib/pipeline/tenantConfig';

/**
 * Pipeline config update schema - passthrough to allow all PipelineConfigInput fields
 */
const pipelineConfigSchema = z
  .object({
    concurrencyLimit: z.number().positive().optional(),
    batchSize: z.number().positive().optional(),
    painScoreThreshold: z.number().min(0).max(100).optional(),
    dailyVolumeLimit: z.number().positive().optional(),
    spendingLimitCents: z.number().nonnegative().optional(),
    hotLeadPercentile: z.number().min(0).max(100).optional(),
    emailMinQualityScore: z.number().min(0).max(100).optional(),
    maxEmailsPerDomainPerDay: z.number().positive().optional(),
    followUpSchedule: z.array(z.number()).optional(),
    pausedStages: z.array(z.string()).optional(),
    country: z.string().optional(),
    language: z.string().optional(),
    currency: z.string().optional(),
    pricingMultiplier: z.number().positive().optional(),
  })
  .passthrough();

/**
 * Inner handler for GET config
 */
async function handleGetConfig(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const config = await getTenantConfig(session.user.tenantId);

    if (!config) {
      return NextResponse.json(
        new NotFoundError('Pipeline configuration', 'not found').toEnvelope(req.url, traceId),
        { status: 404 }
      );
    }

    const response = NextResponse.json({
      config: config.config,
      branding: config.branding,
      tenant: {
        id: config.tenant.id,
        name: config.tenant.name,
        slug: config.tenant.slug,
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error fetching pipeline config:', error);
    const internalError = new InternalError('Failed to fetch pipeline config', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for PUT config
 */
async function handleUpdateConfig(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json();

    // Validate request body
    const result = pipelineConfigSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new InternalError('Invalid config data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const input: PipelineConfigInput = result.data;

    const config = await upsertPipelineConfig(session.user.tenantId, input);

    const response = NextResponse.json({ config });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Error updating pipeline config:', error);

    if (error instanceof Error && error.message.includes('must be')) {
      const validationError = new InternalError('Validation error');
      validationError.details = [{ field: 'config', message: error.message }];
      return NextResponse.json(validationError.toEnvelope(req.url, generateTraceId()), {
        status: 400,
      });
    }

    const internalError = new InternalError('Failed to update pipeline config', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many config requests. Please wait before trying again.',
  })(req, () => handleGetConfig(req));

const rateLimitedPut = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many config updates. Please wait before trying again.',
  })(req, () => handleUpdateConfig(req));

export const GET = rateLimitedGet;
export const PUT = rateLimitedPut;
