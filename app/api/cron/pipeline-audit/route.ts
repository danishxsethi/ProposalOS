import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { processAuditStage } from '@/lib/pipeline/stages/auditStage';

const MAX_TENANTS_PER_RUN = 5;

export async function GET(req: Request) {
  // 1. CRON_SECRET auth
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Find tenants with active PipelineConfig where audit is not paused
    const configs = await prisma.pipelineConfig.findMany({
      take: MAX_TENANTS_PER_RUN,
      orderBy: { updatedAt: 'asc' },
    });

    const activeConfigs = configs.filter((cfg) => {
      const paused = Array.isArray(cfg.pausedStages)
        ? (cfg.pausedStages as string[])
        : [];
      return !paused.includes('audit');
    });

    if (activeConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'No active tenants for audit',
      });
    }

    logger.info(
      {
        event: 'cron.pipeline_audit.start',
        count: activeConfigs.length,
      },
      `Processing audit stage for ${activeConfigs.length} tenants`
    );

    const results: Array<{
      tenantId: string;
      status: string;
      prospectsProcessed?: number;
      succeeded?: number;
      failed?: number;
      error?: string;
    }> = [];

    // 3. Process each tenant
    for (const config of activeConfigs) {
      try {
        const stageResults = await processAuditStage(
          config.tenantId,
          config.batchSize
        );

        const succeeded = stageResults.filter((r) => r.success).length;
        const failed = stageResults.filter((r) => !r.success).length;

        logger.info(
          {
            event: 'cron.pipeline_audit.tenant_complete',
            tenantId: config.tenantId,
            prospectsProcessed: stageResults.length,
            succeeded,
            failed,
          },
          `Audit stage complete for tenant ${config.tenantId}`
        );

        results.push({
          tenantId: config.tenantId,
          status: 'Complete',
          prospectsProcessed: stageResults.length,
          succeeded,
          failed,
        });
      } catch (err) {
        logger.error(
          {
            event: 'cron.pipeline_audit.tenant_error',
            tenantId: config.tenantId,
            error: err,
          },
          `Error processing audit stage for tenant ${config.tenantId}`
        );

        results.push({
          tenantId: config.tenantId,
          status: 'Failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info(
      {
        event: 'cron.pipeline_audit.complete',
        processed: results.length,
        completed: results.filter((r) => r.status === 'Complete').length,
        failed: results.filter((r) => r.status === 'Failed').length,
      },
      'Pipeline audit cron complete'
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    logger.error(
      {
        event: 'cron.pipeline_audit.error',
        error,
      },
      'Pipeline Audit Cron Error'
    );

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
