/**
 * lib/retention/nps.ts
 *
 * Task 4: NPS Automation
 *
 * Handles Day-30 and Day-90 NPS survey sending.
 * Called by the nps-surveys cron endpoint.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NPSSurveyStatus } from '@prisma/client';

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
    surveyId: string,
    appUrl: string
): string {
    const baseUrl = appUrl.replace(/\/$/, '');
    const responseUrl = `${baseUrl}/api/nps/respond?surveyId=${surveyId}&score=`;

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Quick Question For You</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">How are we doing?</h2>
  <p style="color:#475569;margin-top:0">Hi ${prospectName}, it's been ${surveyDay} days since we started working together. We'd love your quick feedback.</p>

  <p style="font-weight:600;margin-top:28px">On a scale of 0–10, how likely are you to recommend us to a colleague or friend?</p>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:20px 0">
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
        const bg = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#22c55e';
        return `<a href="${responseUrl}${n}" style="display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;background:${bg};color:#fff;border-radius:8px;font-weight:700;text-decoration:none;">${n}</a>`;
    }).join('')}
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
export async function sendNPSSurvey(
    projectId: string,
    surveyDay: 30 | 90
): Promise<string | null> {
    try {
        // Fetch project + proposal to get prospect email
        const project = await (prisma as any).project.findUnique({
            where: { id: projectId },
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

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.proposalengine.app';
        const surveyName = project.proposal.prospectName ?? 'there';

        // Create pending survey record first to get the ID
        const survey = await (prisma as any).npsSurvey.create({
            data: {
                projectId,
                tenantId: project.tenantId,
                surveyDay,
                status: NPSSurveyStatus.PENDING,
            },
        });

        const html = buildNpsSurveyHtml(surveyName, surveyDay, survey.id, appUrl);

        await sendEmail(
            project.proposal.prospectEmail,
            surveyDay === 30
                ? 'Quick question — how are we doing? 🙌'
                : "90-day check-in — we'd love your feedback",
            html
        );

        // Mark as SENT
        await (prisma as any).npsSurvey.update({
            where: { id: survey.id },
            data: { status: NPSSurveyStatus.SENT, sentAt: new Date() },
        });

        logger.info({ surveyId: survey.id, projectId, surveyDay }, '[NPS] Survey sent');
        return survey.id;
    } catch (error) {
        logger.error({ err: error, projectId, surveyDay }, '[NPS] sendNPSSurvey failed');
        return null;
    }
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
    try {
        let status: NPSSurveyStatus;
        if (score >= 9) {
            status = NPSSurveyStatus.REFERRAL_SENT;
        } else if (score <= 6) {
            status = NPSSurveyStatus.FLAGGED_DETRACTOR;
        } else {
            status = NPSSurveyStatus.RESPONDED;
        }

        const survey = await (prisma as any).npsSurvey.update({
            where: { id: surveyId },
            data: { score, feedback: feedback ?? null, status, respondedAt: new Date() },
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
            await sendEmail(
                survey.project.proposal.prospectEmail,
                'Know someone we can help? 🤝',
                html
            );
        }

        // Auto-action: flag detractors for manual outreach (could also send internal Slack/webhook)
        if (status === NPSSurveyStatus.FLAGGED_DETRACTOR) {
            logger.warn(
                { surveyId, score, tenantId: survey.tenantId, projectId: survey.projectId },
                '[NPS] Detractor flagged — manual outreach required'
            );
        }
    } catch (error) {
        logger.error({ err: error, surveyId }, '[NPS] handleNPSResponse failed');
        throw error;
    }
}
