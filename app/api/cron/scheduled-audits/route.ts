/**
 * app/api/cron/scheduled-audits/route.ts
 *
 * Scheduled Audits Cron Job
 * Processes due audit schedules and triggers audit creation.
 *
 * P1-22/P1-23 (Wave 2): this route used to instantiate the deprecated
 * AuditOrchestrator directly (fire-and-forget, ~15 of the canonical engine's 27
 * modules) and independently duplicated the exact same AuditSchedule polling logic
 * that lib/retention/scheduled-audit-runner.ts's processScheduledAudits() also ran
 * (via the separate `retention` cron job) — a split-brain where the retention path's
 * stub silently "ate" this route's work every day. Both cron entry points now call
 * the single shared processScheduledAudits(), which dispatches through the durable
 * AuditJob queue (full canonical engine). See lib/retention/scheduled-audit-runner.ts
 * for the consolidated implementation.
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
import { processScheduledAudits } from '@/lib/retention/scheduled-audit-runner';

/**
 * Inner handler for scheduled audits cron
 */
async function handleScheduledAudits(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    logger.info({ event: 'cron.scheduled_audits.start' }, 'Processing scheduled audits');

    const result = await processScheduledAudits();

    logger.info(
      {
        event: 'cron.scheduled_audits.complete',
        auditsRun: result.auditsRun,
        comparisonsGenerated: result.comparisonsGenerated,
        errors: result.errors.length,
      },
      'Scheduled audits cron complete'
    );

    const response = NextResponse.json({
      success: true,
      auditsRun: result.auditsRun,
      comparisonsGenerated: result.comparisonsGenerated,
      errors: result.errors,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error(
      {
        event: 'cron.scheduled_audits.error',
        error,
      },
      'Scheduled Audits Cron Error'
    );

    const internalError = new InternalError('Scheduled audits cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleScheduledAudits(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
