/**
 * Email Sequence Graph (Fix 4A)
 *
 * A LangGraph pipeline that takes a completed proposal and generates a
 * fully-sequenced cold outreach plan:
 *   1. load_prospect_data   - Pulls proposal/audit/findings from DB + locates ProspectLead
 *   2. validate_email       - NeverBounce stub (wired in 4B) + format check
 *   3. generate_sequence    - Uses existing emailComposer to build 5-email cadence
 *   4. schedule_cadence     - Persists OutreachEmail records to DB with send_at offsets
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import { OutreachEmailType, OutreachEmailStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { composeSniperEmail, ComposeSniperEmailInput } from '@/lib/outreach/sprint2/emailComposer';
import { verifyEmail, isEmailBlocked } from '@/lib/outreach/neverBounce';

// ─── State ────────────────────────────────────────────────────────────────────

export const EmailSequenceState = Annotation.Root({
    proposalId: Annotation<string>({ reducer: (x, y) => y }),
    tenantId: Annotation<string>({ reducer: (x, y) => y }),

    // Loaded fields
    leadId: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
    businessName: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
    city: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
    vertical: Annotation<string>({ reducer: (x, y) => y, default: () => 'general' }),
    prospectEmail: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
    painScore: Annotation<number | null>({ reducer: (x, y) => y, default: () => null }),
    topFindings: Annotation<unknown>({ reducer: (x, y) => y, default: () => [] }),
    painBreakdown: Annotation<unknown>({ reducer: (x, y) => y, default: () => ({}) }),
    qualificationEvidence: Annotation<unknown>({ reducer: (x, y) => y, default: () => ({}) }),
    scorecardUrl: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),
    proposalUrl: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),

    // Email validation
    emailValid: Annotation<boolean>({ reducer: (x, y) => y, default: () => true }),
    emailValidationReason: Annotation<string>({ reducer: (x, y) => y, default: () => '' }),

    // Generated sequence
    emails: Annotation<Array<{ type: OutreachEmailType; subject: string; body: string; sendAtOffsetDays: number }>>({
        reducer: (x, y) => y,
        default: () => []
    }),

    // Scheduled result
    scheduledCount: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
    error: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
});

// ─── Email Cadence Definition ─────────────────────────────────────────────────

const EMAIL_CADENCE: { type: OutreachEmailType; sendAtOffsetDays: number; attempt: number }[] = [
    { type: OutreachEmailType.INITIAL, sendAtOffsetDays: 0, attempt: 1 },
    { type: OutreachEmailType.FOLLOWUP_COMPETITOR, sendAtOffsetDays: 4, attempt: 2 },
    { type: OutreachEmailType.FOLLOWUP_PROPOSAL, sendAtOffsetDays: 9, attempt: 3 },
];

// ─── Nodes ────────────────────────────────────────────────────────────────────

async function load_prospect_data(state: typeof EmailSequenceState.State) {
    try {
        const proposal = await prisma.proposal.findUnique({
            where: { id: state.proposalId },
            include: {
                audit: {
                    include: { findings: { take: 10, orderBy: { impactScore: 'desc' } } }
                }
            }
        });

        if (!proposal) {
            return { error: `Proposal ${state.proposalId} not found` };
        }

        const baseUrl = process.env.NEXTAUTH_URL || 'https://proposalos.com';
        const scorecardUrl = `${baseUrl}/scorecard/${proposal.auditId}`;
        const proposalUrl = `${baseUrl}/proposal/${proposal.id}`;

        // Try to locate a matching ProspectLead for this proposal (by domain match)
        let leadId: string | null = null;
        let prospectEmail: string | null = (proposal as any).prospectEmail || null;

        if (proposal.audit?.businessUrl) {
            try {
                const domain = new URL(proposal.audit.businessUrl).hostname.replace(/^www\./, '');
                if (proposal.tenantId) {
                    const lead = await prisma.prospectLead.findFirst({
                        where: {
                            tenantId: proposal.tenantId,
                            website: { contains: domain },
                        },
                        select: { id: true, decisionMakerEmail: true }
                    });
                    if (lead) {
                        leadId = lead.id;
                        prospectEmail = prospectEmail || lead.decisionMakerEmail || null;
                    }
                }
            } catch (_) {
                // URL parse error — skip lead lookup
            }
        }

        return {
            leadId,
            prospectEmail,
            businessName: proposal.audit?.businessName || 'Your Business',
            city: proposal.audit?.businessCity || '',
            vertical: proposal.audit?.businessIndustry || 'general',
            painScore: (proposal.audit as any)?.painScore || null,
            topFindings: proposal.audit?.findings.map(f => f.title) || [],
            painBreakdown: (proposal.audit as any)?.painBreakdown || {},
            qualificationEvidence: (proposal.audit as any)?.qualificationEvidence || {},
            scorecardUrl,
            proposalUrl,
        };
    } catch (err) {
        logger.error({ proposalId: state.proposalId, err }, 'Failed to load prospect data for email sequence');
        return { error: 'Failed to load prospect data' };
    }
}

async function validate_email(state: typeof EmailSequenceState.State) {
    const email = state.prospectEmail;
    if (!email) {
        return { emailValid: false, emailValidationReason: 'No prospect email on proposal or lead' };
    }
    const formatOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!formatOk) {
        return { emailValid: false, emailValidationReason: `Invalid email format: ${email}` };
    }

    // Fix 4B: Blocklist DB check
    const blocked = await isEmailBlocked(email);
    if (blocked) {
        return { emailValid: false, emailValidationReason: `Email is on the blocklist: ${email}` };
    }

    // Fix 4B: NeverBounce real-time verification
    const verification = await verifyEmail(email);
    if (!verification.isSafe) {
        return {
            emailValid: false,
            emailValidationReason: `NeverBounce rejected email: result=${verification.result}, flags=${verification.flags.join(',')}`
        };
    }

    return { emailValid: true };
}

async function generate_sequence(state: typeof EmailSequenceState.State) {
    if (!state.emailValid) {
        logger.warn({ proposalId: state.proposalId, reason: state.emailValidationReason }, 'Skipping sequence generation — invalid email');
        return { emails: [] };
    }

    const composerInput: Omit<ComposeSniperEmailInput, 'type' | 'attempt'> = {
        businessName: state.businessName,
        city: state.city,
        vertical: state.vertical,
        painScore: state.painScore,
        topFindings: state.topFindings,
        painBreakdown: state.painBreakdown,
        qualificationEvidence: state.qualificationEvidence,
        scorecardUrl: state.scorecardUrl,
        proposalUrl: state.proposalUrl,
    };

    const emails = [];
    for (const { type, sendAtOffsetDays, attempt } of EMAIL_CADENCE) {
        try {
            const composed = await composeSniperEmail({ ...composerInput, type, attempt });
            emails.push({
                type,
                subject: composed.subject,
                body: composed.body,
                sendAtOffsetDays,
            });
        } catch (error) {
            logger.error({ proposalId: state.proposalId, type, error }, 'Failed to compose email in sequence');
        }
    }

    logger.info({ proposalId: state.proposalId, count: emails.length }, 'Email sequence generated');
    return { emails };
}

async function schedule_cadence(state: typeof EmailSequenceState.State) {
    if (!state.emails?.length || !state.prospectEmail || !state.leadId) {
        if (!state.leadId) {
            logger.warn({ proposalId: state.proposalId }, 'Cannot schedule cadence: no matching ProspectLead found. Skipping.');
        }
        return { scheduledCount: 0 };
    }

    const now = new Date();
    let scheduledCount = 0;

    for (const email of state.emails) {
        const sendAt = new Date(now);
        sendAt.setDate(sendAt.getDate() + email.sendAtOffsetDays);

        try {
            // Only create if not already scheduled for this type
            const existing = await prisma.outreachEmail.findFirst({
                where: {
                    leadId: state.leadId,
                    type: email.type,
                    status: { in: [OutreachEmailStatus.PENDING, OutreachEmailStatus.SENT] },
                }
            });

            if (!existing) {
                await prisma.outreachEmail.create({
                    data: {
                        tenantId: state.tenantId,
                        leadId: state.leadId,
                        type: email.type,
                        status: OutreachEmailStatus.PENDING,
                        subject: email.subject,
                        body: email.body,
                        scorecardUrl: state.scorecardUrl,
                        proposalUrl: state.proposalUrl,
                    }
                });
                scheduledCount++;
            }
        } catch (err) {
            logger.error({ proposalId: state.proposalId, emailType: email.type, err }, 'Failed to schedule outreach email');
        }
    }

    logger.info({ proposalId: state.proposalId, scheduledCount }, 'Email cadence scheduled');
    return { scheduledCount };
}

// ─── Graph Assembly ───────────────────────────────────────────────────────────

async function analyze_prospect(state: typeof EmailSequenceState.State) {
    const dataState = await load_prospect_data(state);
    if (dataState.error) return dataState;
    const valState = await validate_email({ ...state, ...dataState });
    return { ...dataState, ...valState };
}

async function draft_sequence(state: typeof EmailSequenceState.State) {
    const genState = await generate_sequence(state);
    if (!genState.emails || genState.emails.length === 0) return genState;
    const schedState = await schedule_cadence({ ...state, ...genState });
    return { ...genState, ...schedState };
}

export const emailSequenceGraph = new StateGraph(EmailSequenceState)
    .addNode('analyze_prospect', analyze_prospect)
    .addNode('draft_sequence', draft_sequence)
    .addEdge('__start__', 'analyze_prospect')
    .addEdge('analyze_prospect', 'draft_sequence')
    .addEdge('draft_sequence', '__end__')
    .compile();
