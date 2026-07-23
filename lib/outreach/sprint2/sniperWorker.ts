import { randomUUID } from 'crypto';
import {
    OutreachEmailType,
    OutreachLeadStage,
    OutreachEmailStatus,
    OutreachEventType,
    ProspectLead,
    ProspectLeadStatus,
} from '@prisma/client';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { composeSniperEmail } from './emailComposer';
import { checkSniperEmailQuality } from './emailQualityGate';
import { ensureLeadScorecardToken, ensureBaseUrl, scorecardUrlForToken } from './scorecard';
import { incrementDomainCounter, selectDomainForSend } from './domainRotation';
import { runAuditOrchestrator } from '@/lib/orchestrator';
import { generateProposal } from '@/lib/proposal/runner';

interface LeadWithOutreach extends ProspectLead {
    outreachEmails: Array<{
        id: string;
        type: OutreachEmailType;
        status: OutreachEmailStatus;
        sentAt: Date | null;
        openedAt: Date | null;
        clickedAt: Date | null;
        repliedAt: Date | null;
    }>;
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

type PlannedAction =
    | { kind: 'send'; emailType: OutreachEmailType }
    | { kind: 'drop'; reason: string }
    | { kind: 'skip'; reason: string };

function plusHours(hours: number, base = new Date()): Date {
    return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function plusDays(days: number, base = new Date()): Date {
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveNextActionAt(type: OutreachEmailType, now = new Date()): Date {
    switch (type) {
        case OutreachEmailType.FOLLOWUP_PROPOSAL:
            return plusHours(24, now);
        case OutreachEmailType.FOLLOWUP_COMPETITOR:
            return plusHours(36, now);
        case OutreachEmailType.FOLLOWUP_GBP:
            return plusDays(3, now);
        case OutreachEmailType.FOLLOWUP_RETRY:
            return plusDays(2, now);
        case OutreachEmailType.INITIAL:
        default:
            return plusDays(2, now);
    }
}

function decideAction(lead: LeadWithOutreach): PlannedAction {
    if (lead.outreachReplyCount > 0 || lead.outreachStage === OutreachLeadStage.REPLIED) {
        return { kind: 'skip', reason: 'Lead already replied' };
    }
    if (lead.outreachStage === OutreachLeadStage.DROPPED) {
        return { kind: 'skip', reason: 'Lead is dropped' };
    }

    const attempts = lead.outreachAttempts;
    const opens = lead.outreachOpenCount;
    const clicks = lead.outreachClickCount;

    if (clicks > 0) {
        return { kind: 'send', emailType: OutreachEmailType.FOLLOWUP_PROPOSAL };
    }

    if (opens > 0 && clicks === 0) {
        if (attempts >= 4) {
            return { kind: 'drop', reason: 'Opened repeatedly but never replied' };
        }
        if (attempts >= 3) {
            return { kind: 'send', emailType: OutreachEmailType.FOLLOWUP_GBP };
        }
        return { kind: 'send', emailType: OutreachEmailType.FOLLOWUP_COMPETITOR };
    }

    if (opens === 0) {
        if (attempts >= 3) {
            return { kind: 'drop', reason: 'Never opened after 3 attempts' };
        }
        if (attempts === 0) {
            return { kind: 'send', emailType: OutreachEmailType.INITIAL };
        }
        return { kind: 'send', emailType: OutreachEmailType.FOLLOWUP_RETRY };
    }

    return { kind: 'skip', reason: 'No action for current state' };
}

async function findExistingProposalUrl(lead: LeadWithOutreach, baseUrl: string): Promise<string | null> {
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

async function ensureProposalUrlForLead(lead: LeadWithOutreach, baseUrl: string): Promise<string | null> {
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
                { outreachNextActionAt: null },
                { outreachNextActionAt: { lte: now } },
            ],
        },
        include: {
            outreachEmails: {
                select: {
                    id: true,
                    type: true,
                    status: true,
                    sentAt: true,
                    openedAt: true,
                    clickedAt: true,
                    repliedAt: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
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

    for (const lead of leads) {
        result.processedLeads += 1;
        const action = decideAction(lead);

        if (action.kind === 'skip') {
            result.skipped += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: 'skip',
                outcome: 'skipped',
                reason: action.reason,
            });
            continue;
        }

        if (action.kind === 'drop') {
            if (!dryRun) {
                await markLeadDropped(lead.id, lead.tenantId, action.reason);
            }
            result.droppedLeads += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: 'drop',
                outcome: dryRun ? 'dry-run' : 'dropped',
                reason: action.reason,
            });
            continue;
        }

        const domainSelection = await selectDomainForSend(tenantId);
        if (!domainSelection) {
            result.domainCapReached = true;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: action.emailType,
                outcome: 'blocked',
                reason: 'Domain daily cap reached',
            });
            break;
        }

        const scorecardToken = await ensureLeadScorecardToken(lead.id);
        const scorecardUrl = scorecardUrlForToken(scorecardToken, baseUrl);

        let proposalUrl: string | null = null;
        if (action.emailType === OutreachEmailType.FOLLOWUP_PROPOSAL) {
            proposalUrl = await ensureProposalUrlForLead(lead, baseUrl);
            if (!proposalUrl) {
                if (!dryRun) {
                    await prisma.prospectLead.update({
                        where: { id: lead.id },
                        data: {
                            outreachStage: OutreachLeadStage.PROPOSAL_QUEUED,
                            outreachNextActionAt: plusHours(2),
                        },
                    });
                }
                result.queuedProposals += 1;
                result.details.push({
                    leadId: lead.id,
                    businessName: lead.businessName,
                    action: action.emailType,
                    outcome: dryRun ? 'dry-run' : 'proposal-queued',
                    reason: 'Proposal is being generated',
                });
                continue;
            }
        }

        let composed = composeSniperEmail({
            businessName: lead.businessName,
            city: lead.city,
            vertical: lead.vertical,
            painScore: lead.painScore,
            topFindings: lead.topFindings,
            painBreakdown: lead.painBreakdown,
            qualificationEvidence: lead.qualificationEvidence,
            scorecardUrl,
            proposalUrl,
            type: action.emailType,
            attempt: 1,
        });

        let quality = checkSniperEmailQuality({
            subject: composed.subject,
            body: composed.body,
            requiredFindingSnippets: composed.requiredFindingSnippets,
        });

        for (let attempt = 2; attempt <= 3 && !quality.pass; attempt += 1) {
            composed = composeSniperEmail({
                businessName: lead.businessName,
                city: lead.city,
                vertical: lead.vertical,
                painScore: lead.painScore,
                topFindings: lead.topFindings,
                painBreakdown: lead.painBreakdown,
                qualificationEvidence: lead.qualificationEvidence,
                scorecardUrl,
                proposalUrl,
                type: action.emailType,
                attempt,
            });
            quality = checkSniperEmailQuality({
                subject: composed.subject,
                body: composed.body,
                requiredFindingSnippets: composed.requiredFindingSnippets,
            });
        }

        if (!quality.pass) {
            result.skipped += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: action.emailType,
                outcome: 'failed-quality-gate',
                reason: quality.hardFails.join('; '),
            });
            continue;
        }

        const emailId = randomUUID();
        const trackedScorecardUrl = `${baseUrl}/api/outreach/track/click/${emailId}?kind=scorecard&url=${encodeURIComponent(scorecardUrl)}`;
        const trackedProposalUrl = proposalUrl
            ? `${baseUrl}/api/outreach/track/click/${emailId}?kind=proposal&url=${encodeURIComponent(proposalUrl)}`
            : null;
        const trackingPixelUrl = `${baseUrl}/api/outreach/track/open/${emailId}.png`;

        const trackedBody = replaceUrl(
            replaceUrl(composed.body, proposalUrl, trackedProposalUrl),
            scorecardUrl,
            trackedScorecardUrl,
        );

        if (dryRun) {
            result.sentEmails += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: action.emailType,
                outcome: 'dry-run',
                reason: `quality ${quality.score}`,
            });
            continue;
        }

        await prisma.outreachEmail.create({
            data: {
                id: emailId,
                tenantId: lead.tenantId,
                leadId: lead.id,
                domainId: domainSelection.domain.id,
                type: action.emailType,
                status: OutreachEmailStatus.PENDING,
                subject: composed.subject,
                body: trackedBody,
                qualityScore: quality.score,
                readabilityGrade: quality.readabilityGrade,
                wordCount: quality.wordCount,
                spamRisk: quality.spamRisk,
                findingsUsed: composed.findingsUsed,
                scorecardUrl,
                proposalUrl,
                trackingPixelUrl,
                trackingClickBaseUrl: `${baseUrl}/api/outreach/track/click/${emailId}`,
            },
        });

        try {
            const html = renderHtmlBody(trackedBody, trackingPixelUrl);
            const send = await sendWithResend({
                fromName: domainSelection.domain.fromName,
                fromEmail: domainSelection.domain.fromEmail,
                toEmail: lead.decisionMakerEmail!,
                subject: composed.subject,
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
                        outreachNextActionAt: resolveNextActionAt(action.emailType),
                        outreachStage: action.emailType === OutreachEmailType.FOLLOWUP_PROPOSAL
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
                            emailType: action.emailType,
                            fromEmail: domainSelection.domain.fromEmail,
                            qualityScore: quality.score,
                        },
                    },
                }),
            ]);

            await incrementDomainCounter(domainSelection.domain.id, lead.tenantId, 'sentCount');

            result.sentEmails += 1;
            result.details.push({
                leadId: lead.id,
                businessName: lead.businessName,
                action: action.emailType,
                outcome: 'sent',
                reason: `quality ${quality.score}`,
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
                action: action.emailType,
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

