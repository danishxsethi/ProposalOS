import { randomUUID } from 'crypto';
import {
    OutreachEmailType,
    OutreachLeadStage,
    OutreachEmailStatus,
    OutreachEventType,
    ProspectLead,
    ProspectLeadStatus,
    OutreachEmail,
} from '@prisma/client';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensureLeadScorecardToken, ensureBaseUrl, scorecardUrlForToken } from './scorecard';
import { incrementDomainCounter, selectDomainForSend } from './domainRotation';
import { runAuditOrchestrator } from '@/lib/orchestrator';
import { generateProposal } from '@/lib/proposal/runner';
import { generateEmailSequence } from './sequenceComposer';
import { evaluateSequenceBranching, BranchingEventHistory } from './sequenceBranching';

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

async function findExistingProposalUrl(lead: ProspectLead, baseUrl: string): Promise<string | null> {
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

async function ensureProposalUrlForLead(lead: ProspectLead, baseUrl: string): Promise<string | null> {
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
            logger.warn({
                event: 'outreach.sniper.proposal_generate_failed',
                leadId: lead.id,
                auditId: readyAudit.id,
                error: error instanceof Error ? error.message : String(error),
            }, 'Failed to generate proposal for clicked lead');
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
        runAuditOrchestrator(created.id).catch((error) => {
            logger.warn({
                event: 'outreach.sniper.audit_queue_failed',
                leadId: lead.id,
                auditId: created.id,
                error: error instanceof Error ? error.message : String(error),
            }, 'Failed queued outreach audit');
        });
    }

    return null;
}

function renderHtmlBody(textBody: string, trackingPixelUrl: string): string {
    const escaped = textBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

    return `
        <div style="font-family: Arial, sans-serif; color:#111827; line-height:1.5;">
            <p style="margin:0 0 14px 0; white-space:pre-line;">${escaped}</p>
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

    return { messageId: response.data?.id ?? null };
}

async function markLeadDropped(leadId: string, tenantId: string, reason: string): Promise<void> {
    await prisma.$transaction([
        prisma.prospectLead.update({
            where: { id: leadId },
            data: {
                outreachStage: OutreachLeadStage.DROPPED,
                outreachDroppedAt: new Date(),
                outreachDropReason: reason,
                outreachNextActionAt: null,
            },
        }),
        prisma.outreachEmailEvent.create({
            data: {
                tenantId,
                leadId,
                type: OutreachEventType.LEAD_DROPPED,
                metadata: { reason },
            },
        }),
    ]);
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
                // Or they have pending sequence emails scheduled for now or the past
                { outreachEmails: { some: { status: OutreachEmailStatus.PENDING, scheduledAt: { lte: now } } } }
            ],
        },
        include: {
            outreachEmails: {
                orderBy: { sequencePosition: 'asc' },
            },
        },
        orderBy: [
            { painScore: 'desc' },
            { updatedAt: 'asc' },
        ],
        take: limit,
    });
}

function replaceUrl(source: string, target: string | null, tracked: string | null): string {
    if (!target || !tracked) return source;
    return source.split(target).join(tracked);
}

export async function processSniperOutreach(
    tenantId: string,
    options?: SniperWorkerOptions,
): Promise<SniperWorkerResult> {
    const limitLeads = Math.max(1, Math.min(500, options?.limitLeads ?? 200));
    const dryRun = options?.dryRun === true;
    const baseUrl = ensureBaseUrl();
    const leads = await fetchEligibleLeads(tenantId, limitLeads);

    const result: SniperWorkerResult = {
        processedLeads: 0,
        sentEmails: 0,
        droppedLeads: 0,
        queuedProposals: 0,
        skipped: 0,
        domainCapReached: false,
        details: [],
    };

    const now = new Date();

    for (const lead of leads) {
        result.processedLeads += 1;

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

                // Insert all 5 emails natively
                for (const step of sequence) {
                    const scheduledFor = plusHours(step.scheduledHoursOffset, now);

                    const added = await prisma.outreachEmail.create({
                        data: {
                            id: randomUUID(),
                            tenantId: lead.tenantId,
                            leadId: lead.id,
                            type: step.type,
                            status: step.quality.pass ? OutreachEmailStatus.PENDING : OutreachEmailStatus.FAILED,
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
                            errorMessage: step.quality.pass ? null : step.quality.hardFails.join('; ')
                        }
                    });
                    lead.outreachEmails.push(added); // append locally so we can evaluate it immediately
                }

                await prisma.prospectLead.update({
                    where: { id: lead.id },
                    data: { outreachStage: OutreachLeadStage.EMAIL_SENT } // Just flags it visually out of READY stage
                });
            }
        }

        // 2. Evaluate state branching based on history
        // Construct history from local lead data
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
            hasBounced: lead.outreachDropReason === 'Email bounced',
            hasUnsubscribed: lead.outreachDropReason === 'Prospect unsubscribed',
            lastOpenedAt
        };

        const branchDecision = evaluateSequenceBranching(lead.outreachStage, history, now);

        if (branchDecision.kind === 'cancel_sequence' || branchDecision.kind === 'trigger_closing_agent' || branchDecision.kind === 'pause_for_review') {
            if (!dryRun) {
                // Determine new status
                let newStage = OutreachLeadStage.DROPPED;
                let reason = branchDecision.reason;

                if (branchDecision.kind === 'trigger_closing_agent') {
                    newStage = OutreachLeadStage.PROPOSAL_QUEUED; // The orchestrator or next loop handles actually creating it
                    // Actually if it's trigger closing agent, let's proactively start generating the proposal right here if possible
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
                        }
                    }),
                    prisma.outreachEmail.updateMany({
                        where: { leadId: lead.id, status: OutreachEmailStatus.PENDING },
                        data: { status: OutreachEmailStatus.FAILED, errorMessage: 'Cancelled by behavioral branching' }
                    })
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
            // Evaluator says: wait 48h since open. We'll skip sending today.
            result.skipped += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: 'branching',
                outcome: 'delayed',
                reason: branchDecision.reason,
            });
            continue; // Break out of sending loop for this lead
        }

        // 3. Find the exact next pending email schedule-ready for this sequence
        const nextEmail = lead.outreachEmails.find(e =>
            e.status === OutreachEmailStatus.PENDING &&
            e.scheduledAt && e.scheduledAt <= now
        );

        if (!nextEmail) {
            continue; // No emails scheduled to send right now for this lead
        }

        // 4. Send the nextEmail natively through Resend mappings
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
        const scorecardUrl = nextEmail.scorecardUrl!; // Must exist
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

        let trackedBody = replaceUrl(
            replaceUrl(nextEmail.body, proposalUrl, trackedProposalUrl),
            scorecardUrl,
            trackedScorecardUrl,
        );

        // Inject tracking pixel for read-receipts
        // Inject tracking click URL mappings natively inside our generated html
        await prisma.outreachEmail.update({
            where: { id: emailId },
            data: {
                trackingPixelUrl,
                proposalUrl,
                trackingClickBaseUrl: `${baseUrl}/api/outreach/track/click/${emailId}`,
                body: trackedBody,
                domainId: domainSelection.domain.id
            }
        });

        if (dryRun) {
            result.sentEmails += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: nextEmail.type,
                outcome: 'dry-run',
                reason: `quality ${nextEmail.qualityScore}`,
            });
            continue;
        }

        try {
            const html = renderHtmlBody(trackedBody, trackingPixelUrl);
            const send = await sendWithResend({
                fromName: domainSelection.domain.fromName,
                fromEmail: domainSelection.domain.fromEmail,
                toEmail: lead.decisionMakerEmail!,
                subject: nextEmail.subject,
                html,
                leadId: lead.id,
                tenantId: lead.tenantId,
            });

            await prisma.$transaction([
                prisma.outreachEmail.update({
                    where: { id: emailId },
                    data: {
                        status: OutreachEmailStatus.SENT,
                        sentAt: new Date(),
                        providerMessageId: send.messageId,
                    },
                }),
                prisma.prospectLead.update({
                    where: { id: lead.id },
                    data: {
                        outreachAttempts: { increment: 1 },
                        outreachLastContactedAt: new Date(),
                        outreachStage: nextEmail.type === OutreachEmailType.FOLLOWUP_PROPOSAL
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
                outcome: 'sent',
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

    logger.info({
        event: 'outreach.sniper.worker_complete',
        tenantId,
        processedLeads: result.processedLeads,
        sentEmails: result.sentEmails,
        droppedLeads: result.droppedLeads,
        queuedProposals: result.queuedProposals,
        skipped: result.skipped,
        domainCapReached: result.domainCapReached,
    }, 'Outreach sniper worker completed');

    return result;
}
