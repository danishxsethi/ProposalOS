/**
 * app/api/cron/pipeline-audit/route.ts
 *
 * Pipeline Audit Cron Job
 * Processes prospects through the audit stage
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { processAuditStage } from '@/lib/pipeline/stages/auditStage';
import { prisma } from '@/lib/prisma';

const MAX_TENANTS_PER_RUN = 5;

/**
 * Inner handler for pipeline audit cron
 */
async function handlePipelineAuditCron(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    // 2. Find tenants with active PipelineConfig where audit is not paused
    const configs = await prisma.pipelineConfig.findMany({
      take: MAX_TENANTS_PER_RUN,
      orderBy: { updatedAt: 'asc' },
    });

    const activeConfigs = configs.filter((cfg) => {
      const paused = Array.isArray(cfg.pausedStages) ? (cfg.pausedStages as string[]) : [];
      return !paused.includes('audit');
    });

    if (activeConfigs.length === 0) {
      const response = NextResponse.json({
        success: true,
        processed: 0,
        message: 'No active tenants for audit',
      });
      response.headers.set('X-Trace-Id', traceId);
      return response;
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
        const stageResults = await processAuditStage(config.tenantId, config.batchSize);

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

    const response = NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error(
      {
        event: 'cron.pipeline_audit.error',
        error,
      },
      'Pipeline Audit Cron Error'
    );

    const internalError = new InternalError('Pipeline audit cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handlePipelineAuditCron(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
