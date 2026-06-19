import { randomUUID } from 'crypto';

import {
  OutreachEmail,
  OutreachEmailStatus,
  OutreachEmailType,
  OutreachEventType,
  OutreachLeadStage,
  ProspectLead,
  ProspectLeadStatus,
} from '@prisma/client';
import { Resend } from 'resend';

import { runAudit } from '@/lib/audit/runner';
import { FeatureFlagService } from '@/lib/config/FeatureFlagService';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { generateProposal } from '@/lib/proposal/runner';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';
import { runWithTenantAsync } from '@/lib/tenant/context';

import { incrementDomainCounter, selectDomainForSend } from './domainRotation';
import { ensureBaseUrl, ensureLeadScorecardToken, scorecardUrlForToken } from './scorecard';
import { BranchingEventHistory, evaluateSequenceBranching } from './sequenceBranching';
import { generateEmailSequence } from './sequenceComposer';

interface LeadWithOutreach extends ProspectLead {
  outreachEmails: OutreachEmail[];
}

export interface SniperWorkerOptions {
  limitLeads?: number;
  dryRun?: boolean;
}

export interface SniperWorkerResult {
  processedLeads: number;
  sentEmails: number;
  droppedLeads: number;
  queuedProposals: number;
  skipped: number;
  domainCapReached: boolean;
  capExceeded?: boolean;
  halted?: boolean;
  details: Array<{
    leadId: string;
    businessName: string;
    action: string;
    outcome: string;
    reason?: string;
  }>;
}

function plusHours(hours: number, base = new Date()): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

async function findExistingProposalUrl(
  lead: ProspectLead,
  baseUrl: string
): Promise<string | null> {
  const proposal = await prisma.proposal.findFirst({
    where: {
      tenantId: lead.tenantId,
      audit: {
        businessName: lead.businessName,
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { webLinkToken: true },
  });
  if (!proposal) return null;
  return `${baseUrl}/proposal/${proposal.webLinkToken}`;
}

async function ensureProposalUrlForLead(
  lead: ProspectLead,
  baseUrl: string
): Promise<string | null> {
  const existing = await findExistingProposalUrl(lead, baseUrl);
  if (existing) return existing;

  const readyAudit = await prisma.audit.findFirst({
    where: {
      tenantId: lead.tenantId,
      businessName: lead.businessName,
      status: { in: ['COMPLETE', 'PARTIAL'] },
    },
    include: {
      findings: { take: 1 },
      proposals: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (readyAudit?.proposals?.[0]) {
    return `${baseUrl}/proposal/${readyAudit.proposals[0].webLinkToken}`;
  }

  if (readyAudit && readyAudit.findings.length > 0) {
    try {
      const generated = await generateProposal(readyAudit.id);
      if (generated?.webLinkToken) {
        return `${baseUrl}/proposal/${generated.webLinkToken}`;
      }
    } catch (error) {
      logger.warn(
        {
          event: 'outreach.sniper.proposal_generate_failed',
          leadId: lead.id,
          auditId: readyAudit.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to generate proposal for clicked lead'
      );
    }
  }

  const queuedAudit = await prisma.audit.findFirst({
    where: {
      tenantId: lead.tenantId,
      businessName: lead.businessName,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!queuedAudit) {
    const created = await prisma.audit.create({
      data: {
        tenantId: lead.tenantId,
        businessName: lead.businessName,
        businessCity: lead.city,
        businessIndustry: lead.vertical,
        businessUrl: lead.website,
        status: 'QUEUED',
      },
      select: { id: true },
    });
    runAudit(created.id).catch((error) => {
      logger.error({ auditId: created.id, error }, 'Bg audit failed');
    });
  }

  return null;
}

function renderHtmlBody(
  textBody: string,
  trackingPixelUrl: string,
  unsubscribeUrl: string
): string {
  const escaped = textBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const physicalAddress =
    process.env.COMPANY_PHYSICAL_ADDRESS ||
    'ProposalOS, 123 Outbound Ave, Suite 400, San Francisco, CA 94107';

  return `
        <div style="font-family: Arial, sans-serif; color:#111827; line-height:1.5; max-width:600px; margin:0 auto;">
            <p style="margin:0 0 14px 0; white-space:pre-line;">${escaped}</p>
            <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; color:#6b7280; text-align:center;">
                <p style="margin:0 0 8px 0;">This email was sent to you as part of our business audit outreach. <a href="${unsubscribeUrl}" style="color:#2563eb; text-decoration:underline;">Unsubscribe here</a></p>
                <p style="margin:0;">${physicalAddress}</p>
            </div>
            <img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:block;opacity:0;" />
        </div>
    `;
}

async function sendWithResend(params: {
  fromName: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  html: string;
  leadId: string;
  tenantId: string;
}): Promise<{ messageId: string | null }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is required');
  }

  const resend = new Resend(key);
  const fromName = params.fromName || process.env.OUTREACH_SENDER_NAME || 'ProposalOS';

  const messageId = await withProviderResilience<string | null>(
    {
      provider: 'resend',
      operation: 'outreach:send_email',
      tenantId: params.tenantId,
    },
    async () => {
      const response = await resend.emails.send({
        from: `${fromName} <${params.fromEmail}>`,
        to: params.toEmail,
        subject: params.subject,
        html: params.html,
        tags: [
          { name: 'category', value: 'outreach-sniper' },
          { name: 'lead_id', value: params.leadId },
          { name: 'tenant_id', value: params.tenantId },
        ],
      });

      if (response.error) {
        throw new Error(response.error.message || 'Resend send failed');
      }

      return response.data?.id ?? null;
    }
  );

  return { messageId };
}

async function fetchEligibleLeads(tenantId: string, limit: number): Promise<LeadWithOutreach[]> {
  const now = new Date();
  return prisma.prospectLead.findMany({
    where: {
      tenantId,
      status: ProspectLeadStatus.ENRICHED,
      painScore: { gte: 60 },
      decisionMakerEmail: { not: null },
      outreachStage: { notIn: [OutreachLeadStage.REPLIED, OutreachLeadStage.DROPPED] },
      OR: [
        { outreachStage: OutreachLeadStage.READY },
        {
          outreachEmails: {
            some: { status: OutreachEmailStatus.PENDING, scheduledAt: { lte: now } },
          },
        },
      ],
    },
    include: {
      outreachEmails: {
        orderBy: { sequencePosition: 'asc' },
      },
    },
    orderBy: [{ painScore: 'desc' }, { updatedAt: 'asc' }],
    take: limit,
  });
}

function replaceUrl(source: string, target: string | null, tracked: string | null): string {
  if (!target || !tracked) return source;
  return source.split(target).join(tracked);
}

export async function processSniperOutreach(
  tenantId: string,
  options?: SniperWorkerOptions
): Promise<SniperWorkerResult> {
  return runWithTenantAsync(tenantId, async () => {
    const result: SniperWorkerResult = {
      processedLeads: 0,
      sentEmails: 0,
      droppedLeads: 0,
      queuedProposals: 0,
      skipped: 0,
      domainCapReached: false,
      details: [],
    };

    // 1. KILL SWITCH CHECK
    const isKillSwitchOn = await FeatureFlagService.isEnabled('KILL_SWITCH_FORCE_MANUAL_MODE');
    if (isKillSwitchOn) {
      logger.warn(
        { tenantId },
        'Sniper outreach halted immediately due to KILL_SWITCH_FORCE_MANUAL_MODE being ON'
      );
      result.halted = true;
      return result;
    }

    const limitLeads = Math.max(1, Math.min(500, options?.limitLeads ?? 200));
    const dryRun = options?.dryRun === true;
    const baseUrl = ensureBaseUrl();
    const leads = await fetchEligibleLeads(tenantId, limitLeads);

    const now = new Date();

    // P2: Human-in-the-loop setting
    let tenantRequireHumanReview = false;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { requireHumanReview: true },
    });
    if (tenant?.requireHumanReview) {
      tenantRequireHumanReview = true;
    }

    // Get active live sending flag
    const liveSendingEnabled = await FeatureFlagService.isEnabled('OUTREACH_LIVE_SENDING');

    // Enforce caps: 100 daily limit, 5000 global limit
    const dailyCap = Number(process.env.OUTREACH_DAILY_SEND_CAP || 100);
    const globalCap = Number(process.env.OUTREACH_GLOBAL_SEND_CAP || 5000);

    for (const lead of leads) {
      result.processedLeads += 1;

      // A. Stop sequence if prospect is on the suppression list (bounced/complained/unsubscribed)
      let isSuppressed = false;
      try {
        const blocked = lead.decisionMakerEmail
          ? await prisma.emailBlocklist.findUnique({
              where: { email: lead.decisionMakerEmail },
              select: { id: true, reason: true },
            })
          : null;

        if (blocked) {
          isSuppressed = true;
          // Suppress and mark lead dropped
          await prisma.$transaction([
            prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                outreachStage: OutreachLeadStage.DROPPED,
                outreachDropReason: `Suppressed globally: ${blocked.reason || 'unsubscribe'}`,
              },
            }),
            prisma.outreachEmail.updateMany({
              where: { leadId: lead.id, status: OutreachEmailStatus.PENDING },
              data: {
                status: OutreachEmailStatus.FAILED,
                errorMessage: 'Cancelled due to blocklist suppression',
              },
            }),
          ]);

          result.skipped += 1;
          result.droppedLeads += 1;
          result.details.push({
            leadId: lead.id,
            businessName: lead.businessName,
            action: 'suppression',
            outcome: 'dropped',
            reason: `Globally blocklisted: ${blocked.reason}`,
          });
          continue;
        }
      } catch (e) {
        logger.error({ error: e, leadId: lead.id }, 'Suppression lookup error');
      }

      // 1. If lead is exactly READY, we must generate and insert the entire 5-email sequence
      if (lead.outreachStage === OutreachLeadStage.READY && lead.outreachEmails.length === 0) {
        if (!dryRun) {
          const scorecardToken = await ensureLeadScorecardToken(lead.id);
          const scorecardUrl = scorecardUrlForToken(scorecardToken, baseUrl);

          const sequence = generateEmailSequence({
            tenantId: lead.tenantId,
            leadId: lead.id,
            businessName: lead.businessName,
            city: lead.city,
            vertical: lead.vertical,
            painScore: lead.painScore,
            topFindings: lead.topFindings,
            painBreakdown: lead.painBreakdown,
            qualificationEvidence: lead.qualificationEvidence,
            scorecardUrl: scorecardUrl,
          });

          // eslint-disable-next-line no-console
          logger.info(
            'DEBUG SEQUENCE:',
            JSON.stringify(
              sequence.map((s) => ({
                type: s.type,
                pass: s.quality.pass,
                score: s.quality.score,
                hardFails: s.quality.hardFails,
                body: s.composed.body,
              })),
              null,
              2
            )
          );

          // Insert all 5 emails natively
          for (const step of sequence) {
            const scheduledFor = plusHours(step.scheduledHoursOffset, now);

            const added = await prisma.outreachEmail.create({
              data: {
                id: randomUUID(),
                tenantId: lead.tenantId,
                leadId: lead.id,
                type: step.type,
                status: step.quality.pass
                  ? OutreachEmailStatus.PENDING
                  : OutreachEmailStatus.FAILED,
                subject: step.composed.subject,
                body: step.composed.body,
                qualityScore: step.quality.score,
                readabilityGrade: step.quality.readabilityGrade,
                wordCount: step.quality.wordCount,
                spamRisk: step.quality.spamRisk,
                findingsUsed: step.composed.findingsUsed,
                scorecardUrl: scorecardUrl,
                sequencePosition: step.sequencePosition,
                scheduledAt: scheduledFor,
                errorMessage: step.quality.pass ? null : step.quality.hardFails.join('; '),
              },
            });
            lead.outreachEmails.push(added); // append locally
          }

          await prisma.prospectLead.update({
            where: { id: lead.id },
            data: { outreachStage: OutreachLeadStage.EMAIL_SENT },
          });
        }
      }

      // 2. Evaluate state branching based on history (stops sequence on reply/bounce/unsub)
      let lastOpenedAt: Date | null = null;
      for (const e of lead.outreachEmails) {
        if (e.openedAt && (!lastOpenedAt || e.openedAt > lastOpenedAt)) {
          lastOpenedAt = e.openedAt;
        }
      }

      const history: BranchingEventHistory = {
        totalOpens: lead.outreachOpenCount,
        totalClicks: lead.outreachClickCount,
        totalReplies: lead.outreachReplyCount,
        hasBounced: lead.outreachDropReason?.includes('bounced') || false,
        hasUnsubscribed: lead.outreachDropReason?.includes('unsubscribed') || isSuppressed,
        lastOpenedAt,
      };

      const branchDecision = evaluateSequenceBranching(lead.outreachStage, history, now);

      if (
        branchDecision.kind === 'cancel_sequence' ||
        branchDecision.kind === 'trigger_closing_agent' ||
        branchDecision.kind === 'pause_for_review'
      ) {
        if (!dryRun) {
          let newStage: OutreachLeadStage = OutreachLeadStage.DROPPED;
          const reason = branchDecision.reason;

          if (branchDecision.kind === 'trigger_closing_agent') {
            newStage = OutreachLeadStage.PROPOSAL_QUEUED;
            await ensureProposalUrlForLead(lead, baseUrl);
          } else if (branchDecision.kind === 'pause_for_review') {
            newStage = OutreachLeadStage.REPLIED;
          }

          // Update lead and cancel remaining scheduled emails
          await prisma.$transaction([
            prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                outreachStage: newStage,
                outreachDropReason: reason,
              },
            }),
            prisma.outreachEmail.updateMany({
              where: { leadId: lead.id, status: OutreachEmailStatus.PENDING },
              data: {
                status: OutreachEmailStatus.FAILED,
                errorMessage: 'Cancelled by behavioral branching',
              },
            }),
          ]);
        }

        result.skipped += 1;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: 'branching',
          outcome: branchDecision.kind,
          reason: branchDecision.reason,
        });
        continue;
      }

      if (branchDecision.kind === 'continue' && branchDecision.reason.includes('waiting')) {
        result.skipped += 1;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: 'branching',
          outcome: 'delayed',
          reason: branchDecision.reason,
        });
        continue;
      }

      // 3. Find the exact next pending email schedule-ready for this sequence
      const nextEmail = lead.outreachEmails.find(
        (e) => e.status === OutreachEmailStatus.PENDING && e.scheduledAt && e.scheduledAt <= now
      );

      if (!nextEmail) {
        continue; // No emails scheduled to send right now for this lead
      }

      // 4. Select rotated sending domain
      const domainSelection = await selectDomainForSend(tenantId);
      if (!domainSelection) {
        result.domainCapReached = true;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: nextEmail.type,
          outcome: 'blocked',
          reason: 'Domain daily cap reached',
        });
        break;
      }

      // Finalize Tracking Params & Proposal injection optionally
      const emailId = nextEmail.id;
      const scorecardUrl = nextEmail.scorecardUrl!;
      let proposalUrl: string | null = null;

      if (nextEmail.type === OutreachEmailType.FOLLOWUP_PROPOSAL) {
        proposalUrl = await ensureProposalUrlForLead(lead, baseUrl);
        if (!proposalUrl) {
          if (!dryRun) {
            await prisma.prospectLead.update({
              where: { id: lead.id },
              data: {
                outreachStage: OutreachLeadStage.PROPOSAL_QUEUED,
              },
            });
          }
          result.queuedProposals += 1;
          result.details.push({
            leadId: lead.id,
            businessName: lead.businessName,
            action: nextEmail.type,
            outcome: dryRun ? 'dry-run' : 'proposal-queued',
            reason: 'Proposal is being generated',
          });
          continue;
        }
      }

      const trackedScorecardUrl = `${baseUrl}/api/outreach/track/click/${emailId}?kind=scorecard&url=${encodeURIComponent(scorecardUrl)}`;
      const trackedProposalUrl = proposalUrl
        ? `${baseUrl}/api/outreach/track/click/${emailId}?kind=proposal&url=${encodeURIComponent(proposalUrl)}`
        : null;
      const trackingPixelUrl = `${baseUrl}/api/outreach/track/open/${emailId}.png`;

      const trackedBody = replaceUrl(
        replaceUrl(nextEmail.body, proposalUrl, trackedProposalUrl),
        scorecardUrl,
        trackedScorecardUrl
      );

      // Save tracked params in db
      await prisma.outreachEmail.update({
        where: { id: emailId },
        data: {
          trackingPixelUrl,
          proposalUrl,
          trackingClickBaseUrl: `${baseUrl}/api/outreach/track/click/${emailId}`,
          body: trackedBody,
          domainId: domainSelection.domain.id,
        },
      });

      if (dryRun || tenantRequireHumanReview) {
        result.sentEmails += 1;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: nextEmail.type,
          outcome: dryRun ? 'dry-run' : 'pending-approval',
          reason: dryRun
            ? `quality ${nextEmail.qualityScore}`
            : 'Human review required by tenant setting',
        });
        continue;
      }

      // 5. ATOMIC TENANT-LEVEL CAP CHECKS WITH POSTGRESQL ROW LOCKING
      let capCheckPassed = false;
      try {
        await prisma.$transaction(async (tx) => {
          // Enforce concurrency safe locking
          await tx.$executeRawUnsafe(`SELECT id FROM "Tenant" WHERE id = $1 FOR UPDATE`, tenantId);

          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date();
          endOfToday.setHours(23, 59, 59, 999);

          // Count sent today
          const todaysSent = await tx.outreachEmail.count({
            where: {
              tenantId,
              status: OutreachEmailStatus.SENT,
              sentAt: { gte: startOfToday, lte: endOfToday },
            },
          });

          // Count global sent
          const totalSent = await tx.outreachEmail.count({
            where: {
              tenantId,
              status: OutreachEmailStatus.SENT,
            },
          });

          if (todaysSent >= dailyCap) {
            throw new Error(`Daily send limit cap of ${dailyCap} reached`);
          }
          if (totalSent >= globalCap) {
            throw new Error(`Global send limit cap of ${globalCap} reached`);
          }

          capCheckPassed = true;
        });
      } catch (capError) {
        const msg = capError instanceof Error ? capError.message : String(capError);
        logger.warn({ tenantId, error: msg }, 'Tenant send cap triggered');
        result.capExceeded = true;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: nextEmail.type,
          outcome: 'blocked',
          reason: msg,
        });
        break; // Stop process queue on hard cap limit
      }

      if (!capCheckPassed) {
        break;
      }

      // 6. DISPATCH OR RUN SANDBOX MOCK TRANSPORT
      try {
        const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(lead.decisionMakerEmail!)}`;
        const html = renderHtmlBody(trackedBody, trackingPixelUrl, unsubscribeUrl);

        let resendMessageId: string | null = `mock_${randomUUID()}`;

        if (liveSendingEnabled) {
          // LIVE TRANSMISSION (ONLY IF EXPLICITLY ON)
          const send = await sendWithResend({
            fromName: domainSelection.domain.fromName,
            fromEmail: domainSelection.domain.fromEmail,
            toEmail: lead.decisionMakerEmail!,
            subject: nextEmail.subject,
            html,
            leadId: lead.id,
            tenantId: lead.tenantId,
          });
          resendMessageId = send.messageId;
        } else {
          // SANDBOX MOCK RECORDER (ZERO real sends, completely safe)
          logger.info(
            {
              event: 'outreach.sniper.mock_send',
              to: lead.decisionMakerEmail,
              from: domainSelection.domain.fromEmail,
              subject: nextEmail.subject,
            },
            '[SANDBOX DRY-RUN] Zero real sends. Mock sending successful.'
          );
        }

        await prisma.$transaction([
          prisma.outreachEmail.update({
            where: { id: emailId },
            data: {
              status: OutreachEmailStatus.SENT,
              sentAt: new Date(),
              providerMessageId: resendMessageId,
            },
          }),
          prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
              outreachAttempts: { increment: 1 },
              outreachLastContactedAt: new Date(),
              outreachStage:
                nextEmail.type === OutreachEmailType.FOLLOWUP_PROPOSAL
                  ? OutreachLeadStage.PROPOSAL_SENT
                  : OutreachLeadStage.EMAIL_SENT,
            },
          }),
          prisma.outreachEmailEvent.create({
            data: {
              tenantId: lead.tenantId,
              leadId: lead.id,
              emailId,
              type: OutreachEventType.EMAIL_SENT,
              metadata: {
                emailType: nextEmail.type,
                fromEmail: domainSelection.domain.fromEmail,
                qualityScore: nextEmail.qualityScore,
                isMock: !liveSendingEnabled,
              },
            },
          }),
        ]);

        await incrementDomainCounter(domainSelection.domain.id, lead.tenantId, 'sentCount');

        result.sentEmails += 1;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: nextEmail.type,
          outcome: liveSendingEnabled ? 'sent' : 'mock-sent',
          reason: `quality ${nextEmail.qualityScore}`,
        });
      } catch (error) {
        await prisma.outreachEmail.update({
          where: { id: emailId },
          data: {
            status: OutreachEmailStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
        result.skipped += 1;
        result.details.push({
          leadId: lead.id,
          businessName: lead.businessName,
          action: nextEmail.type,
          outcome: 'send-failed',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(
      {
        event: 'outreach.sniper.worker_complete',
        tenantId,
        processedLeads: result.processedLeads,
        sentEmails: result.sentEmails,
        droppedLeads: result.droppedLeads,
        queuedProposals: result.queuedProposals,
        skipped: result.skipped,
        domainCapReached: result.domainCapReached,
      },
      'Outreach sniper worker completed'
    );

    return result;
  });
}
