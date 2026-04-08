/**
 * app/api/cron/intelligence-aggregation/route.ts
 *
 * Intelligence Aggregation Cron Job
 * Aggregates anonymized patterns from recent outcomes across all tenants
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextRequest, NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { aggregatePatterns } from '@/lib/pipeline/crossTenantIntelligence';
import { prisma } from '@/lib/prisma';

/**
 * Inner handler for intelligence aggregation cron
 */
async function handleIntelligenceAggregation(req: NextRequest): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const startTime = Date.now();
    let totalOutcomes = 0;
    let tenantsProcessed = 0;
    let errors = 0;

    // Get all tenants
    const tenants = await prisma.tenant.findMany();

    // For each tenant, aggregate recent outcomes
    for (const tenant of tenants) {
      try {
        // Get recent win/loss records (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const winLossRecords = await prisma.winLossRecord.findMany({
          where: {
            tenantId: tenant.id,
            createdAt: { gte: sevenDaysAgo },
          },
        });

        if (winLossRecords.length > 0) {
          const outcomes = winLossRecords.map((record: any) => ({
            outcome: record.outcome as 'won' | 'lost' | 'ghosted',
            tierChosen: record.tierChosen || undefined,
            dealValue: record.dealValue ? Number(record.dealValue) : undefined,
            lostReason: record.lostReason || undefined,
            objectionsRaised: (record.objectionsRaised as string[]) || [],
            competitorMentioned: record.competitorMentioned || undefined,
            vertical: record.vertical,
            city: record.city || 'Unknown',
            painScore: 0,
          }));

          await aggregatePatterns(tenant.id, outcomes);
          totalOutcomes += outcomes.length;
          tenantsProcessed++;
        }
      } catch (error) {
        console.error(`Error aggregating patterns for tenant ${tenant.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;

    const response = NextResponse.json({
      success: true,
      totalOutcomes,
      tenantsProcessed,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Intelligence aggregation cron error:', error);
    const internalError = new InternalError('Intelligence aggregation cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: NextRequest): Promise<NextResponse> => {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  return handleIntelligenceAggregation(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: NextRequest) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const POST = rateLimitedHandler;
