import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { PromptPerformanceTracker } from '@/lib/self-evolving-prompts/PromptPerformanceTracker';

const tracker = new PromptPerformanceTracker();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = await verifyCronAuth(request);
  if (authError) return authError;

  try {
    const underperforming = await tracker.getUnderperformingPrompts(40, 10);

    // 2. Identify winning A/B variants
    // In a fully integrated system, this would swap the default versionHash in the
    // prompts database for the node.

    if (underperforming.length > 0) {
      logger.warn(
        {
          count: underperforming.length,
          variants: underperforming.map((p: any) => p.versionHash),
        },
        'Found underperforming prompt variants to demote'
      );
    }

    logger.info(
      {
        action: 'prompt_auto_promotion',
        demotedCount: underperforming.length,
      },
      'Executed prompt auto-promotion cycle'
    );

    return NextResponse.json({
      success: true,
      demotedCount: underperforming.length,
      demotedVariants: underperforming,
    });
  } catch (error) {
    logger.error({ error }, 'Failed auto-promotion cron execution');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
