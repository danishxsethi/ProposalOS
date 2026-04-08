/**
 * app/api/analytics/benchmarks/route.ts
 *
 * Industry Benchmarks API
 * Get industry benchmarks for comparison
 *
 * Features:
 * - Auth & rate limiting
 * - Zod validation
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError, NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { getServerSession } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Query params schema for GET requests
 */
const benchmarksQuerySchema = z.object({
  industry: z.string().min(1).max(100),
});

/**
 * Calculate percentile
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

/**
 * Inner handler for GET benchmarks
 */
async function handleGetBenchmarks(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const industry = url.searchParams.get('industry');

    // Validate query params
    const result = benchmarksQuerySchema.safeParse({ industry });
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const error = new NotFoundError('Invalid query parameters');
      error.details = errorDetails;
      return NextResponse.json(error.toEnvelope(req.url, traceId), { status: 400 });
    }

    // Get all completed audits for the industry
    const audits = await prisma.audit.findMany({
      where: {
        businessIndustry: industry,
        status: 'COMPLETE',
        overallScore: { not: null },
      },
      include: {
        findings: {
          where: { excluded: false },
        },
        proposals: {
          where: { outcome: 'WON' },
          select: { dealValue: true },
        },
      },
    });

    if (audits.length === 0) {
      const response = NextResponse.json({
        industry,
        sampleSize: 0,
        message: 'No benchmark data available for this industry',
      });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }

    // Calculate benchmarks
    const scores = audits.map((a) => a.overallScore!).filter((s) => s > 0);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    const findingCounts = audits.map((a) => a.findings.length);
    const avgFindings = findingCounts.reduce((sum, c) => sum + c, 0) / findingCounts.length;

    // Average deal values
    const dealValues = audits
      .flatMap((a) => a.proposals)
      .map((p) => Number(p.dealValue))
      .filter((v) => v > 0);

    const avgDealValue =
      dealValues.length > 0 ? dealValues.reduce((sum, v) => sum + v, 0) / dealValues.length : 0;

    // Finding type distribution
    const findingTypes = audits
      .flatMap((a) => a.findings)
      .reduce((acc: any, f) => {
        const category = f.category || 'Other';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

    // Cost distribution
    const costs = audits.map((a) => a.apiCostCents);
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;

    const response = NextResponse.json({
      industry,
      sampleSize: audits.length,
      benchmarks: {
        avgScore: Math.round(avgScore * 10) / 10,
        avgFindings: Math.round(avgFindings * 10) / 10,
        avgDealValue: Math.round(avgDealValue * 100) / 100,
        avgCostCents: Math.round(avgCost),
        findingTypeDistribution: findingTypes,
      },
      percentiles: {
        score: {
          p25: calculatePercentile(scores, 25),
          p50: calculatePercentile(scores, 50),
          p75: calculatePercentile(scores, 75),
        },
        findings: {
          p25: calculatePercentile(findingCounts, 25),
          p50: calculatePercentile(findingCounts, 50),
          p75: calculatePercentile(findingCounts, 75),
        },
      },
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('[API] Error fetching benchmarks:', error);
    const internalError = new InternalError('Failed to fetch benchmarks', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, generateTraceId()), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedHandler = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many benchmark requests. Please wait before trying again.',
  })(req, () => handleGetBenchmarks(req));

export const GET = rateLimitedHandler;
