/**
 * app/api/cron/pipeline-outreach/route.ts
 *
 * Outreach Cron Job
 * Processes qualified prospects and sends outreach emails
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
import { sendWithRotation } from '@/lib/pipeline/inboxRotation';
import { generateAndQualifyEmail, scheduleFollowUps } from '@/lib/pipeline/outreach';
import { transition } from '@/lib/pipeline/stateMachine';
import type { OutreachContext } from '@/lib/pipeline/types';
import { PipelineStage } from '@/lib/pipeline/types';
import { prisma } from '@/lib/prisma';

const MAX_TENANTS_PER_RUN = 5;
const DEFAULT_BATCH_SIZE = 50;

/**
 * Inner handler for outreach cron
 */
async function handleOutreachCron(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    // 2. Find tenants with active PipelineConfig where outreach is not paused
    const configs = await prisma.pipelineConfig.findMany({
      take: MAX_TENANTS_PER_RUN,
      orderBy: { updatedAt: 'asc' },
    });

    const activeConfigs = configs.filter((cfg) => {
      const paused = Array.isArray(cfg.pausedStages) ? (cfg.pausedStages as string[]) : [];
      return !paused.includes('outreach');
    });

    if (activeConfigs.length === 0) {
      const response = NextResponse.json({
        success: true,
        processed: 0,
        message: 'No active tenants for outreach',
      });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }

    logger.info(
      {
        event: 'cron.pipeline_outreach.start',
        count: activeConfigs.length,
      },
      `Processing outreach stage for ${activeConfigs.length} tenants`
    );

    const results: Array<{
      tenantId: string;
      status: string;
      prospectsProcessed?: number;
      emailsSent?: number;
      emailsQueued?: number;
      failed?: number;
      error?: string;
    }> = [];

    // 3. Process each tenant
    for (const config of activeConfigs) {
      try {
        const batchSize = config.batchSize || DEFAULT_BATCH_SIZE;

        // Find prospects in "QUALIFIED" status for this tenant
        const prospects = await prisma.prospectLead.findMany({
          where: {
            tenantId: config.tenantId,
            pipelineStatus: 'QUALIFIED',
          },
          take: batchSize,
          orderBy: { createdAt: 'asc' },
        });

        if (prospects.length === 0) {
          logger.info(
            {
              event: 'cron.pipeline_outreach.no_prospects',
              tenantId: config.tenantId,
            },
            `No prospects in "QUALIFIED" status for tenant ${config.tenantId}`
          );

          results.push({
            tenantId: config.tenantId,
            status: 'Complete',
            prospectsProcessed: 0,
            emailsSent: 0,
            emailsQueued: 0,
            failed: 0,
          });
          continue;
        }

        logger.info(
          {
            event: 'cron.pipeline_outreach.tenant_start',
            tenantId: config.tenantId,
            prospectsCount: prospects.length,
          },
          `Processing ${prospects.length} prospects for tenant ${config.tenantId}`
        );

        let emailsSent = 0;
        let emailsQueued = 0;
        let failed = 0;

        // Process each prospect
        for (const prospect of prospects) {
          try {
            // Fetch audit and proposal separately
            const audit = await prisma.audit.findFirst({
              where: {
                businessUrl: prospect.website || '',
                tenantId: config.tenantId,
              },
              include: {
                findings: true,
              },
              orderBy: { createdAt: 'desc' },
            });

            const proposal = await prisma.proposal.findFirst({
              where: {
                auditId: audit?.id,
              },
              orderBy: { createdAt: 'desc' },
            });

            // Skip if no audit or proposal
            if (!audit || !proposal) {
              logger.warn(
                {
                  event: 'cron.pipeline_outreach.missing_data',
                  prospectId: prospect.id,
                  hasAudit: !!audit,
                  hasProposal: !!proposal,
                },
                `Skipping prospect ${prospect.id} - missing audit or proposal`
              );
              failed++;
              continue;
            }

            // Build outreach context
            const context: OutreachContext = {
              prospect,
              audit: audit,
              proposal: proposal,
              findings: audit.findings || [],
              painBreakdown: (prospect.painBreakdown as any) || {
                websiteSpeed: 0,
                mobileBroken: 0,
                gbpNeglected: 0,
                noSsl: 0,
                zeroReviewResponses: 0,
                socialMediaDead: 0,
                competitorsOutperforming: 0,
                accessibilityViolations: 0,
              },
              vertical: prospect.vertical || 'default',
              tenantBranding: {
                brandName: 'Our Team',
                contactEmail: 'hello@example.com',
              },
            };

            // Generate and qualify email
            const email = await generateAndQualifyEmail(context);

            // Send with rotation
            const sendResult = await sendWithRotation(email, config.tenantId);

            if (sendResult.status === 'sent') {
              emailsSent++;

              // Schedule follow-ups
              await scheduleFollowUps(prospect.id, sendResult.emailId);

              // Transition prospect to "outreach_sent"
              await transition(prospect.id, 'outreach_sent', PipelineStage.OUTREACH);

              logger.info(
                {
                  event: 'cron.pipeline_outreach.email_sent',
                  prospectId: prospect.id,
                  emailId: sendResult.emailId,
                  sendingDomain: sendResult.sendingDomain,
                },
                `Outreach email sent for prospect ${prospect.id}`
              );
            } else if (sendResult.status === 'queued') {
              emailsQueued++;

              logger.info(
                {
                  event: 'cron.pipeline_outreach.email_queued',
                  prospectId: prospect.id,
                  reason: sendResult.error,
                },
                `Outreach email queued for prospect ${prospect.id}`
              );
            } else {
              failed++;

              logger.error(
                {
                  event: 'cron.pipeline_outreach.email_failed',
                  prospectId: prospect.id,
                  error: sendResult.error,
                },
                `Failed to send outreach email for prospect ${prospect.id}`
              );

              // Log to PipelineErrorLog
              await prisma.pipelineErrorLog.create({
                data: {
                  tenantId: config.tenantId,
                  stage: PipelineStage.OUTREACH,
                  prospectId: prospect.id,
                  errorType: 'EMAIL_SEND_FAILED',
                  errorMessage: sendResult.error || 'Unknown error',
                  metadata: JSON.parse(JSON.stringify({ sendResult })),
                },
              });
            }
          } catch (err) {
            failed++;

            const errorMessage = err instanceof Error ? err.message : String(err);

            logger.error(
              {
                event: 'cron.pipeline_outreach.prospect_error',
                prospectId: prospect.id,
                error: errorMessage,
              },
              `Error processing prospect ${prospect.id}`
            );

            // Log to PipelineErrorLog
            await prisma.pipelineErrorLog.create({
              data: {
                tenantId: config.tenantId,
                stage: PipelineStage.OUTREACH,
                prospectId: prospect.id,
                errorType: 'OUTREACH_PROCESSING_ERROR',
                errorMessage,
                metadata: {},
              },
            });
          }
        }

        logger.info(
          {
            event: 'cron.pipeline_outreach.tenant_complete',
            tenantId: config.tenantId,
            prospectsProcessed: prospects.length,
            emailsSent,
            emailsQueued,
            failed,
          },
          `Outreach stage complete for tenant ${config.tenantId}`
        );

        results.push({
          tenantId: config.tenantId,
          status: 'Complete',
          prospectsProcessed: prospects.length,
          emailsSent,
          emailsQueued,
          failed,
        });
      } catch (err) {
        logger.error(
          {
            event: 'cron.pipeline_outreach.tenant_error',
            tenantId: config.tenantId,
            error: err,
          },
          `Error processing outreach stage for tenant ${config.tenantId}`
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
        event: 'cron.pipeline_outreach.complete',
        processed: results.length,
        completed: results.filter((r) => r.status === 'Complete').length,
        failed: results.filter((r) => r.status === 'Failed').length,
        totalEmailsSent: results.reduce((sum, r) => sum + (r.emailsSent || 0), 0),
        totalEmailsQueued: results.reduce((sum, r) => sum + (r.emailsQueued || 0), 0),
      },
      'Pipeline outreach cron complete'
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
        event: 'cron.pipeline_outreach.error',
        error,
      },
      'Pipeline Outreach Cron Error'
    );

    const internalError = new InternalError('Pipeline outreach cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleOutreachCron(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
