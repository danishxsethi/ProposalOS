/**
 * Pipeline Configuration API
 * 
 * GET: Read current pipeline configuration
 * PUT: Update pipeline configuration with validation
 * 
 * Requirements: 9.2, 9.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getPipelineConfig,
  getTenantConfig,
  upsertPipelineConfig,
  type PipelineConfigInput,
} from '@/lib/pipeline/tenantConfig';

/**
 * GET /api/pipeline/config
 * Read current pipeline configuration for the authenticated tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const config = await getTenantConfig(session.user.tenantId);

    if (!config) {
      return NextResponse.json(
        { error: 'Pipeline configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      config: config.config,
      branding: config.branding,
      tenant: {
        id: config.tenant.id,
        name: config.tenant.name,
        slug: config.tenant.slug,
      },
    });
  } catch (error) {
    console.error('Error fetching pipeline config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pipeline/config
 * Update pipeline configuration with validation
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const input: PipelineConfigInput = {
      concurrencyLimit: body.concurrencyLimit,
      batchSize: body.batchSize,
      painScoreThreshold: body.painScoreThreshold,
      dailyVolumeLimit: body.dailyVolumeLimit,
      spendingLimitCents: body.spendingLimitCents,
      hotLeadPercentile: body.hotLeadPercentile,
      emailMinQualityScore: body.emailMinQualityScore,
      maxEmailsPerDomainPerDay: body.maxEmailsPerDomainPerDay,
      followUpSchedule: body.followUpSchedule,
      pausedStages: body.pausedStages,
      country: body.country,
      language: body.language,
      currency: body.currency,
      pricingMultiplier: body.pricingMultiplier,
    };

    // Remove undefined values
    Object.keys(input).forEach(key => {
      if (input[key as keyof PipelineConfigInput] === undefined) {
        delete input[key as keyof PipelineConfigInput];
      }
    });

    const config = await upsertPipelineConfig(session.user.tenantId, input);

    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error updating pipeline config:', error);
    
    if (error instanceof Error && error.message.includes('must be')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
