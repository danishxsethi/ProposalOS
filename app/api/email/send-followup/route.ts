import { NextResponse } from 'next/server';

import { validateCustomerClaim } from '@/lib/claims/claimContract';
import { fillFollowUpTemplate, getFollowUpTemplate } from '@/lib/email-templates/followup-sequence';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

const PHYSICAL_ADDRESS = process.env.BRAND_PHYSICAL_ADDRESS?.trim();

/**
 * POST /api/email/send-followup
 * Send a follow-up email (1, 2, or 3) from the post-meeting sequence.
 * Body: { auditId, emailNumber (1|2|3), recipientEmail, recipientName? }
 */
export const POST = withAuth(async (req: Request) => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
    }

    const body = await req.json();
    const auditId = body.auditId as string | undefined;
    const emailNumber = body.emailNumber as number | undefined;
    const recipientEmail = body.recipientEmail as string | undefined;
    const recipientName = (body.recipientName as string) || 'there';

    if (!auditId || !emailNumber || !recipientEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: auditId, emailNumber (1|2|3), recipientEmail' },
        { status: 400 }
      );
    }

    const step = emailNumber as 1 | 2 | 3;
    if (step < 1 || step > 3) {
      return NextResponse.json({ error: 'emailNumber must be 1, 2, or 3' }, { status: 400 });
    }

    const template = getFollowUpTemplate(step);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const audit = await prisma.audit.findFirst({
      where: { id: auditId, tenantId },
      include: {
        findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' }, take: 5 },
        proposals: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const proposal = audit.proposals[0];
    if (!proposal) {
      return NextResponse.json({ error: 'No proposal found for this audit' }, { status: 404 });
    }

    if (!PHYSICAL_ADDRESS) {
      return NextResponse.json(
        { error: 'Follow-up delivery is unavailable until BRAND_PHYSICAL_ADDRESS is configured' },
        { status: 503 }
      );
    }

    if (proposal.prospectEmail !== recipientEmail) {
      return NextResponse.json(
        { error: 'Recipient must match the proposal prospect email' },
        { status: 400 }
      );
    }

    const existing = await prisma.proposalFollowUp.findFirst({
      where: {
        tenantId,
        proposalId: proposal.id,
        step,
        type: 'manual_email',
        status: { in: ['pending', 'sending', 'sent', 'unknown'] },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return NextResponse.json({
        accepted: existing.status === 'pending' || existing.status === 'sending',
        followUpId: existing.id,
        status: existing.status,
      });
    }

    const baseUrl =
      process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const proposalUrl = `${baseUrl}/proposal/${proposal.webLinkToken}`;
    const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;

    const topFinding = audit.findings[0];
    if (!topFinding) {
      return NextResponse.json(
        { error: 'A validated finding is required before a follow-up can be queued' },
        { status: 422 }
      );
    }
    const findingText = [topFinding.title, topFinding.description].filter(Boolean).join(': ');
    const claim = validateCustomerClaim(
      {
        claimId: `manual-followup:${proposal.id}:${step}:${topFinding.id}`,
        text: findingText,
        claimType: 'DETERMINISTIC_OBSERVATION',
        sourceFindingIds: [topFinding.id],
        configurationRefs: [],
        classification: 'deterministic',
        confidence: Math.max(0, Math.min(1, Number(topFinding.confidenceScore) / 10)),
        assumptions: [],
        metricInputs: [],
        estimate: false,
        recommendation: false,
        provenance: { producer: 'api.email.send-followup' },
      },
      { auditId, tenantId, findings: audit.findings }
    );
    if (!claim.success) {
      return NextResponse.json(
        { error: 'Follow-up claim validation failed', reasons: claim.issues },
        { status: 422 }
      );
    }

    const { subject, body: emailBody } = fillFollowUpTemplate(template, {
      businessName: audit.businessName,
      proposalUrl,
      finding: findingText,
      metric: '',
      recipientName,
      physicalAddress: PHYSICAL_ADDRESS,
      unsubscribeUrl,
    });

    const followUp = await prisma.proposalFollowUp.create({
      data: {
        proposalId: proposal.id,
        tenantId,
        step,
        type: 'manual_email',
        status: 'pending',
        scheduledAt: new Date(),
        emailSubject: subject,
        emailBody,
      },
    });

    logger.info(
      { event: 'followup_email_queued', auditId, step, recipientEmail, followUpId: followUp.id },
      'Follow-up email queued for durable dispatch'
    );

    return NextResponse.json(
      { accepted: true, followUpId: followUp.id, status: 'pending' },
      { status: 202 }
    );
  } catch (err) {
    logger.error(
      { event: 'followup_email_error', error: err instanceof Error ? err.message : String(err) },
      'Send follow-up error'
    );
    return NextResponse.json(
      { error: 'Internal Server Error', message: String(err) },
      { status: 500 }
    );
  }
});
