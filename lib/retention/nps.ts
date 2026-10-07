/**
 * lib/retention/nps.ts
 *
 * Task 4: NPS Automation
 *
 * Handles Day-30 and Day-90 NPS survey sending.
 * Called by the nps-surveys cron endpoint.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

import { NPSSurveyStatus } from '@prisma/client';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ensureLifecycleOccurrence } from '@/lib/retention/lifecycleControl';
import {
  completeLifecycleSend,
  guardLifecycleSend,
  markLifecycleSendUnknown,
  recheckLifecycleSend,
} from '@/lib/retention/lifecycleSafety';
import { runWithTenantAsync } from '@/lib/tenant/context';

const NPS_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function hashNpsToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createNpsResponseToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashNpsToken(raw), expiresAt: new Date(Date.now() + NPS_TOKEN_TTL_MS) };
}

// ─── Email helper ──────────────────────────────────────────────────────────────
// Uses the same Resend-based email utility pattern as the rest of the codebase.

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL ?? 'noreply@proposalengine.app',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error: ${err}`);
    }
  } catch (error) {
    logger.error({ err: error, to, subject }, '[NPS] Failed to send email');
    throw error;
  }
}

// ─── Survey emails ─────────────────────────────────────────────────────────────

function buildNpsSurveyHtml(
  prospectName: string,
  surveyDay: number,
  token: string,
  appUrl: string
): string {
  const baseUrl = appUrl.replace(/\/$/, '');
  const responseUrl = `${baseUrl}/api/nps/respond?token=${token}&score=`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Quick Question For You</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">How are we doing?</h2>
  <p style="color:#475569;margin-top:0">Hi ${prospectName}, it's been ${surveyDay} days since we started working together. We'd love your quick feedback.</p>

  <p style="font-weight:600;margin-top:28px">On a scale of 0–10, how likely are you to recommend us to a colleague or friend?</p>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0">
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .map((n) => {
        const bg = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#22c55e';
        return `<a href="${responseUrl}${n}" style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;background:${bg};color:#fff;border-radius:8px;font-weight:700;text-decoration:none;">${n}</a>`;
      })
      .join('')}
  </div>

  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="${baseUrl}/unsubscribe" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`;
}

// ─── Core API ──────────────────────────────────────────────────────────────────

/**
 * Send an NPS survey for a project at a given day milestone.
 * Creates the NPSSurvey record with status SENT.
 * Returns the survey ID.
 */
export async function sendNPSSurvey(projectId: string, surveyDay: 30 | 90): Promise<string | null> {
  try {
    // Fetch project (system enumeration boundary — caller does not yet know the tenant).
    const projectHead = await (prisma as any).project.findUnique({
      where: { id: projectId },
      select: { tenantId: true },
    });
    if (!projectHead?.tenantId) {
      logger.warn({ projectId }, '[NPS] Project not found — skipping survey');
      return null;
    }

    return await runWithTenantAsync(projectHead.tenantId, async () => {
      const project = await (prisma as any).project.findUnique({
        where: { id: projectId, tenantId: projectHead.tenantId },
        include: {
          proposal: {
            select: { prospectEmail: true, prospectName: true, webLinkToken: true },
          },
        },
      });

      if (!project?.proposal?.prospectEmail) {
        logger.warn({ projectId }, '[NPS] No prospect email — skipping survey');
        return null;
      }

      // At most one active survey per (project, surveyDay) — check before creating a new row.
      const existing = await (prisma as any).npsSurvey.findFirst({
        where: { projectId, surveyDay, tenantId: projectHead.tenantId },
      });
      if (existing) {
        logger.info({ projectId, surveyDay, surveyId: existing.id }, '[NPS] Survey already exists');
        return existing.id;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.proposalengine.app';
      const surveyName = project.proposal.prospectName ?? 'there';
      const token = createNpsResponseToken();
      const idempotencyKey = `nps:${projectId}:${surveyDay}`;

      // Create pending survey record first to get the ID
      const survey = await (prisma as any).npsSurvey.create({
        data: {
          projectId,
          tenantId: projectHead.tenantId,
          surveyDay,
          status: NPSSurveyStatus.PENDING,
          tokenHash: token.hash,
          tokenExpiresAt: token.expiresAt,
        },
      });

      const lifecycleInput = {
        tenantId: projectHead.tenantId,
        idempotencyKey,
        recipientEmail: project.proposal.prospectEmail,
        workflow: 'NPS' as const,
        entityId: survey.id,
        occurrenceKey: String(surveyDay),
      };
      const guard = await guardLifecycleSend(lifecycleInput);
      if (!guard.allowed) {
        logger.warn({ projectId, surveyDay, reason: guard.reason }, '[NPS] Send blocked');
        return null;
      }

      const html = buildNpsSurveyHtml(surveyName, surveyDay, token.raw, appUrl);

      try {
        if (!(await recheckLifecycleSend(lifecycleInput))) return null;
        await sendEmail(
          project.proposal.prospectEmail,
          surveyDay === 30
            ? 'Quick question — how are we doing? 🙌'
            : "90-day check-in — we'd love your feedback",
          html
        );
      } catch (sendError) {
        // Ambiguous outcome: the provider call may or may not have succeeded.
        await markLifecycleSendUnknown(
          lifecycleInput,
          sendError instanceof Error ? sendError.message : 'send failed'
        );
        throw sendError;
      }

      await completeLifecycleSend(lifecycleInput);

      // Mark as SENT
      await (prisma as any).npsSurvey.update({
        where: { id: survey.id },
        data: { status: NPSSurveyStatus.SENT, sentAt: new Date() },
      });

      logger.info({ surveyId: survey.id, projectId, surveyDay }, '[NPS] Survey sent');
      return survey.id;
    });
  } catch (error) {
    logger.error({ err: error, projectId, surveyDay }, '[NPS] sendNPSSurvey failed');
    return null;
  }
}

export async function processPendingNPSSurveys(): Promise<{
  day30Processed: number;
  day90Processed: number;
  sent: number;
  errors: string[];
}> {
  const now = new Date();
  const errors: string[] = [];
  let day30Processed = 0;
  let day90Processed = 0;
  let sent = 0;
  const projects = await (prisma as any).project.findMany({
    where: { status: 'COMPLETE', completedAt: { not: null } },
    include: { npsSurveys: { select: { surveyDay: true } } },
  });

  for (const project of projects) {
    if (!project.completedAt) continue;
    const days = Math.floor((now.getTime() - new Date(project.completedAt).getTime()) / 86_400_000);
    const existing = new Set<number>(project.npsSurveys.map((survey: any) => survey.surveyDay));
    for (const surveyDay of [30, 90] as const) {
      const inWindow = surveyDay === 30 ? days >= 30 && days < 35 : days >= 90 && days < 95;
      if (!inWindow || existing.has(surveyDay)) continue;
      try {
        const surveyId = await sendNPSSurvey(project.id, surveyDay);
        if (surveyDay === 30) day30Processed++;
        else day90Processed++;
        if (surveyId) sent++;
      } catch {
        errors.push(`NPS ${surveyDay}-day survey failed for ${project.id}`);
      }
    }
  }
  return { day30Processed, day90Processed, sent, errors };
}

/**
 * Handle a prospect's NPS response.
 * - score >= 9 → mark REFERRAL_SENT, send referral request email
 * - score <= 6 → mark FLAGGED_DETRACTOR for manual outreach
 * - 7–8 → mark RESPONDED
 */
export async function handleNPSResponse(
  surveyId: string,
  score: number,
  feedback?: string
): Promise<void> {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new Error('NPS score must be an integer between 0 and 10');
  }

  try {
    const surveyHead = await (prisma as any).npsSurvey.findUnique({
      where: { id: surveyId },
      select: { tenantId: true, status: true },
    });
    if (!surveyHead) {
      throw new Error('Survey not found');
    }
    // Response is accepted once — reject a second response for an already-terminal survey.
    if (
      surveyHead.status === NPSSurveyStatus.RESPONDED ||
      surveyHead.status === NPSSurveyStatus.REFERRAL_SENT ||
      surveyHead.status === NPSSurveyStatus.FLAGGED_DETRACTOR
    ) {
      logger.info({ surveyId }, '[NPS] Duplicate response ignored — survey already answered');
      return;
    }

    await runWithTenantAsync(surveyHead.tenantId, async () => {
      let status: NPSSurveyStatus;
      if (score >= 9) {
        status = NPSSurveyStatus.REFERRAL_SENT;
      } else if (score <= 6) {
        status = NPSSurveyStatus.FLAGGED_DETRACTOR;
      } else {
        status = NPSSurveyStatus.RESPONDED;
      }

      // Free-text feedback is untrusted: never interpolated into any downstream template.
      const sanitizedFeedback = typeof feedback === 'string' ? feedback.slice(0, 2000) : null;

      const survey = await (prisma as any).npsSurvey.update({
        where: { id: surveyId, tenantId: surveyHead.tenantId },
        data: {
          score,
          feedback: sanitizedFeedback,
          status,
          respondedAt: new Date(),
          tokenConsumedAt: new Date(),
        },
        include: {
          project: {
            include: {
              proposal: { select: { prospectEmail: true, prospectName: true } },
            },
          },
        },
      });

      logger.info({ surveyId, score, status }, '[NPS] Response recorded');

      // Auto-action: send referral email for promoters
      if (status === NPSSurveyStatus.REFERRAL_SENT && survey.project?.proposal?.prospectEmail) {
        const referralKey = `nps-referral:${surveyId}`;
        const lifecycleInput = {
          tenantId: surveyHead.tenantId,
          idempotencyKey: referralKey,
          recipientEmail: survey.project.proposal.prospectEmail,
          workflow: 'NPS_REFERRAL' as const,
          entityId: surveyId,
          occurrenceKey: 'referral',
        };
        const guard = await guardLifecycleSend(lifecycleInput);
        if (guard.allowed) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.proposalengine.app';
          const name = survey.project.proposal.prospectName ?? 'there';
          const html = `<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2>Thank you, ${name}! 🎉</h2>
  <p>We're genuinely thrilled you'd recommend us. Do you know someone who could benefit from what we offer?</p>
  <a href="${appUrl}/referral?from=${surveyId}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px">Share a Referral →</a>
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS</p>
</body>
</html>`;
          try {
            if (!(await recheckLifecycleSend(lifecycleInput))) return;
            await sendEmail(
              survey.project.proposal.prospectEmail,
              'Know someone we can help? 🤝',
              html
            );
            await completeLifecycleSend(lifecycleInput);
          } catch (sendError) {
            await markLifecycleSendUnknown(lifecycleInput, sendError instanceof Error ? sendError.message : 'send failed');
          }
        } else {
          logger.warn({ surveyId, reason: guard.reason }, '[NPS] Referral email blocked');
        }
      }

      // Auto-action: flag detractors for durable manual outreach (no automated public claim).
      if (status === NPSSurveyStatus.FLAGGED_DETRACTOR) {
        await ensureLifecycleOccurrence({
          tenantId: surveyHead.tenantId,
          workflow: 'NPS_DETRACTOR_REVIEW',
          entityId: surveyId,
          occurrenceKey: 'review',
          idempotencyKey: `nps-detractor:${surveyId}`,
        });
        await (prisma as any).lifecycleOccurrence?.updateMany?.({
          where: {
            tenantId: surveyHead.tenantId,
            workflow: 'NPS_DETRACTOR_REVIEW',
            entityId: surveyId,
            occurrenceKey: 'review',
            status: { not: 'MANUAL_REVIEW' },
          },
          data: { status: 'MANUAL_REVIEW' },
        });
        logger.warn(
          { surveyId, score, tenantId: surveyHead.tenantId, projectId: survey.projectId },
          '[NPS] Detractor flagged — manual outreach required'
        );
      }
    });
  } catch (error) {
    logger.error({ err: error, surveyId }, '[NPS] handleNPSResponse failed');
    throw error;
  }
}

/** Public-token entry point. It deliberately exposes no tenant or survey existence information. */
export async function handleNPSResponseToken(
  token: string,
  score: number,
  feedback?: string
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;

  const tokenHash = hashNpsToken(token);
  const survey = await (prisma as any).npsSurvey.findFirst({
    where: {
      tokenHash,
      tokenExpiresAt: { gt: new Date() },
      tokenConsumedAt: null,
    },
    select: { id: true, tokenHash: true },
  });
  if (!survey?.tokenHash) return false;

  const expected = Buffer.from(survey.tokenHash, 'hex');
  const supplied = Buffer.from(tokenHash, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;

  try {
    await handleNPSResponse(survey.id, score, feedback);
    return true;
  } catch {
    return false;
  }
}
