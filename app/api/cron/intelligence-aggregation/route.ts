import { NextRequest, NextResponse } from 'next/server';
import { aggregatePatterns, getModelVersion, isOptedOut } from '@/lib/intelligence/crossTenantLearning';
import { prisma } from '@/lib/db';
import type { AnonymizedOutcome } from '@/lib/intelligence/types';

/**
 * POST /api/cron/intelligence-aggregation
 *
 * Runs daily pattern aggregation across all opted-in tenants.
 * Versions the model on each run and logs aggregation stats.
 *
 * Requirements: 11.3, 11.5
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    const previousVersion = await getModelVersion();

    let tenantsIncluded = 0;
    let tenantsSkipped = 0;
    let totalOutcomes = 0;
    let errors = 0;

    const allOutcomes: AnonymizedOutcome[] = [];

    // Collect outcomes from all opted-in tenants
    const tenants = await prisma.tenant.findMany({ where: { isActive: true } });

    for (const tenant of tenants) {
      try {
        // Skip opted-out tenants
        if (await isOptedOut(tenant.id)) {
          tenantsSkipped++;
          continue;
        }

        // Fetch recent win/loss records (last 24 hours for daily run)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const records = await prisma.winLossRecord.findMany({
          where: { tenantId: tenant.id, createdAt: { gte: oneDayAgo } },
          include: { prospect: { select: { vertical: true, city: true, painScore: true } } },
        });

        if (records.length === 0) continue;

        const outcomes: AnonymizedOutcome[] = records.map((r) => ({
          vertical: r.vertical ?? r.prospect?.vertical ?? 'unknown',
          geoRegion: r.prospect?.city ?? 'unknown',
          painScore: r.prospect?.painScore ?? 0,
          outcome: r.outcome as 'won' | 'lost' | 'ghosted',
          tierChosen: r.tierChosen ?? undefined,
          dealValue: r.dealValue ? Number(r.dealValue) : undefined,
          findingTypes: (r.objectionsRaised as string[]) ?? [],
          emailTemplateId: undefined,
          // No tenant IDs, business names, or contact info
        }));

        allOutcomes.push(...outcomes);
        totalOutcomes += outcomes.length;
        tenantsIncluded++;
      } catch (err) {
        console.error(`Error collecting outcomes for tenant ${tenant.id}:`, err);
        errors++;
      }
    }

    // Aggregate all collected outcomes into a new model version
    let newVersion = previousVersion;
    let patternsGenerated = 0;

    if (allOutcomes.length > 0) {
      await aggregatePatterns(allOutcomes);
      newVersion = await getModelVersion();

      // Count patterns in new model
      const model = await prisma.sharedIntelligenceModel.findFirst({
        where: { isActive: true },
        select: { patterns: true },
      });
      patternsGenerated = Array.isArray(model?.patterns) ? (model.patterns as unknown[]).length : 0;
    }

    const duration = Date.now() - startTime;

    console.log(
      `[intelligence-aggregation] tenants=${tenantsIncluded} skipped=${tenantsSkipped} ` +
      `outcomes=${totalOutcomes} patterns=${patternsGenerated} ` +
      `version=${newVersion} previousVersion=${previousVersion} duration=${duration}ms`
    );

    return NextResponse.json({
      success: true,
      tenantsIncluded,
      tenantsSkipped,
      totalOutcomes,
      patternsGenerated,
      previousVersion,
      newVersion,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Intelligence aggregation cron error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
