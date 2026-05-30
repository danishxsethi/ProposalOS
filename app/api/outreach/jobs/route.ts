/**
 * app/api/outreach/jobs/route.ts
 *
 * Outreach Discovery Jobs API
 * Manage prospect discovery jobs for outreach
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { Prisma, ProspectDiscoveryJobStatus } from '@prisma/client';
import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import {
  DEFAULT_SPRINT2_VERTICALS,
  normalizeVertical,
  TOP_50_US_METROS,
} from '@/lib/outreach/sprint2/config';
import { enqueueDiscoveryJobs } from '@/lib/outreach/sprint2/worker';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

function parseCities(
  body: Record<string, unknown>
): Array<{ city: string; state?: string | null; metro?: string | null }> {
  if (Array.isArray(body.cities)) {
    const cities: Array<{ city: string; state?: string | null; metro?: string | null }> = [];
    for (const row of body.cities) {
      if (!row || typeof row !== 'object') continue;
      const candidate = row as Record<string, unknown>;
      const city = typeof candidate.city === 'string' ? candidate.city.trim() : '';
      if (!city) continue;
      const state = typeof candidate.state === 'string' ? candidate.state.trim() : null;
      const metro = typeof candidate.metro === 'string' ? candidate.metro.trim() : null;
      cities.push({ city, state, metro });
    }
    return cities;
  }

  const singleCity = typeof body.city === 'string' ? body.city.trim() : '';
  if (!singleCity) return [];

  return [
    {
      city: singleCity,
      state: typeof body.state === 'string' ? body.state.trim() : null,
      metro: typeof body.metro === 'string' ? body.metro.trim() : null,
    },
  ];
}

function parseVerticals(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.verticals) && body.verticals.length > 0) {
    return body.verticals
      .filter((value): value is string => typeof value === 'string')
      .map((value) => normalizeVertical(value))
      .filter(Boolean);
  }

  if (typeof body.vertical === 'string' && body.vertical.trim().length > 0) {
    return [normalizeVertical(body.vertical)];
  }

  return [...DEFAULT_SPRINT2_VERTICALS];
}

/**
 * Query params schema for GET requests
 */
const jobsQuerySchema = z.object({
  status: z.nativeEnum(ProspectDiscoveryJobStatus).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  vertical: z.string().max(100).optional().nullable(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

/**
 * Create jobs schema for POST requests
 */
const createJobsSchema = z.object({
  seedTop50: z.boolean().optional().default(false),
  cities: z
    .array(
      z.object({
        city: z.string().min(1),
        state: z.string().optional().nullable(),
        metro: z.string().optional().nullable(),
      })
    )
    .optional(),
  city: z.string().optional(),
  state: z.string().optional().nullable(),
  metro: z.string().optional().nullable(),
  verticals: z.array(z.string()).optional(),
  vertical: z.string().optional(),
  painThreshold: z.number().optional(),
  targetLeads: z.number().optional(),
  sourceConfig: z
    .object({
      googlePlaces: z.boolean().optional(),
      yelp: z.boolean().optional(),
      directories: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Inner handler for GET jobs
 */
async function handleGetJobs(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new UnauthorizedError('No tenant found').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const searchParams = url.searchParams;

    // Validate query params
    const result = jobsQuerySchema.safeParse({
      status: searchParams.get('status'),
      city: searchParams.get('city'),
      vertical: searchParams.get('vertical'),
      limit: searchParams.get('limit'),
    });

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const { status, city, vertical, limit } = result.data;

    const where: Prisma.ProspectDiscoveryJobWhereInput = { tenantId };
    if (status) {
      where.status = status;
    }
    if (city) where.city = city;
    if (vertical) where.vertical = normalizeVertical(vertical);

    const jobs = await prisma.prospectDiscoveryJob.findMany({
      where,
      take: limit,
      orderBy: [{ createdAt: 'desc' }],
    });

    const response = NextResponse.json({
      jobs,
      count: jobs.length,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Error fetching outreach jobs:', error);
    const internalError = new InternalError('Failed to fetch outreach jobs', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

/**
 * Inner handler for POST create jobs
 */
async function handleCreateJobs(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        new UnauthorizedError('No tenant found').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

    // Validate request body
    const result = createJobsSchema.safeParse(payload);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid jobs data');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    const {
      seedTop50,
      cities: bodyCities,
      verticals,
      vertical,
      painThreshold,
      targetLeads,
      sourceConfig,
    } = result.data;

    const cities = seedTop50
      ? [...TOP_50_US_METROS]
      : parseCities({
          cities: bodyCities,
          city: result.data.city,
          state: result.data.state,
          metro: result.data.metro,
        });
    const parsedVerticals = parseVerticals({ verticals, vertical });

    if (cities.length === 0) {
      const citiesError = new NotFoundError('Cities required');
      citiesError.details = [
        { field: 'cities', message: 'At least one city is required, or set seedTop50=true' },
      ];
      return NextResponse.json(citiesError.toEnvelope(req.url, traceId), { status: 400 });
    }
    if (parsedVerticals.length === 0) {
      const verticalsError = new NotFoundError('Verticals required');
      verticalsError.details = [
        { field: 'verticals', message: 'At least one vertical is required' },
      ];
      return NextResponse.json(verticalsError.toEnvelope(req.url, traceId), { status: 400 });
    }

    const resultJobs = await enqueueDiscoveryJobs({
      tenantId,
      cities,
      verticals: parsedVerticals,
      painThreshold,
      targetLeads,
      sourceConfig: sourceConfig
        ? {
            googlePlaces:
              sourceConfig.googlePlaces === undefined
                ? undefined
                : Boolean(sourceConfig.googlePlaces),
            yelp: sourceConfig.yelp === undefined ? undefined : Boolean(sourceConfig.yelp),
            directories:
              sourceConfig.directories === undefined
                ? undefined
                : Boolean(sourceConfig.directories),
          }
        : undefined,
    });

    const response = NextResponse.json({
      success: true,
      createdCount: resultJobs.created.length,
      skippedCount: resultJobs.skipped.length,
      createdJobIds: resultJobs.created,
      skipped: resultJobs.skipped.slice(0, 25),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Error creating outreach jobs:', error);
    const internalError = new InternalError('Failed to create outreach jobs', {
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
    message: 'Too many jobs requests. Please wait before trying again.',
  })(req, () => handleGetJobs(req));

const rateLimitedPost = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many job creation requests. Please wait before trying again.',
  })(req, () => handleCreateJobs(req));

export const GET = rateLimitedGet;
export const POST = rateLimitedPost;
