import { NextRequest, NextResponse } from 'next/server';
import { aggregatePatterns } from '@/lib/pipeline/crossTenantIntelligence';
import { prisma } from '@/lib/db';

/**
 * POST /api/cron/intelligence-aggregation
 * Aggregate anonymized patterns from recent outcomes across all tenants
 * Runs weekly to update the shared intelligence model
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          const outcomes = winLossRecords.map((record) => ({
            outcome: record.outcome as 'won' | 'lost' | 'ghosted',
            tierChosen: record.tierChosen || undefined,
            dealValue: record.dealValue ? Number(record.dealValue) : undefined,
            lostReason: record.lostReason || undefined,
            objectionsRaised: (record.objectionsRaised as string[]) || [],
            competitorMentioned: record.competitorMentioned || undefined,
            vertical: record.vertical,
            city: record.city || 'Unknown',
            painScore: 0, // Would need to join with prospect data
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

    return NextResponse.json({
      success: true,
      totalOutcomes,
      tenantsProcessed,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Intelligence aggregation cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
