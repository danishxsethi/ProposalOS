/**
 * POST /api/proposal/[token]/track
 * First-party analytics: view, scroll depth, time on page, CTA click, expanded sections.
 * Also feeds engagement data to Deal Closer for hot lead scoring.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { recordEvent } from '@/lib/pipeline/dealCloser';
import type { EngagementEvent } from '@/lib/pipeline/types';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const body = await req.json();

        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
            include: {
                audit: true,
            },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
        const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
        const userAgent = req.headers.get('user-agent') || null;
        const referrer = req.headers.get('referer') || body.referrer || null;

        const { event, sessionId, scrollDepth, timeOnPageSeconds, ctaClicked, expandedSections } = body;

        // TODO: Prospect lead engagement tracking - requires prospectLead relation in Audit model
        // const prospectLead = proposal.audit?.prospectLead?.[0];

        if (event === 'view') {
            // First view: create ProposalView record
            await prisma.proposalView.create({
                data: {
                    proposalId: proposal.id,
                    sessionId: sessionId || crypto.randomUUID(),
                    viewedAt: new Date(),
                    scrollDepth: 0,
                    timeOnPageSeconds: 0,
                    ctaClicked: false,
                    expandedSections: [],
                    userAgent,
                    referrer,
                    ipHash,
                },
            });

            // TODO: Record engagement event in Deal Closer when prospectLead relation is available
            // if (prospectLead) {
            //     try {
            //         const engagementEvent: EngagementEvent = {
            //             leadId: prospectLead.id,
            //             eventType: 'proposal_view',
            //             timestamp: new Date(),
            //             metadata: {
            //                 proposalId: proposal.id,
            //                 sessionId: sessionId || crypto.randomUUID(),
            //             },
            //         };
            //         await recordEvent(prospectLead.id, engagementEvent);
            //     } catch (error) {
            //         console.error('Failed to record engagement event:', error);
            //     }
            // }

            return NextResponse.json({ success: true });
        }

        if (event === 'scroll' || event === 'time' || event === 'cta' || event === 'expand') {
            // Find existing view by sessionId
            const existing = await prisma.proposalView.findFirst({
                where: { proposalId: proposal.id, sessionId: body.sessionId },
                orderBy: { viewedAt: 'desc' },
            });

            if (!existing) {
                return NextResponse.json({ error: 'Session not found' }, { status: 400 });
            }

            const updates: Record<string, unknown> = {};

            if (event === 'scroll' && typeof scrollDepth === 'number') {
                if (scrollDepth > existing.scrollDepth) {
                    updates.scrollDepth = scrollDepth;
                }
            }
            if (event === 'time' && typeof timeOnPageSeconds === 'number') {
                updates.timeOnPageSeconds = Math.max(existing.timeOnPageSeconds, timeOnPageSeconds);
            }
            if (event === 'cta') {
                updates.ctaClicked = true;

                // TODO: Record tier interaction in Deal Closer when prospectLead relation is available
                // if (prospectLead) {
                //     try {
                //         const engagementEvent: EngagementEvent = {
                //             leadId: prospectLead.id,
                //             eventType: 'tier_interaction',
                //             timestamp: new Date(),
                //             metadata: {
                //                 proposalId: proposal.id,
                //                 sessionId: body.sessionId,
                //                 ctaClicked: true,
                //             },
                //         };
                //         await recordEvent(prospectLead.id, engagementEvent);
                //     } catch (error) {
                //         console.error('Failed to record engagement event:', error);
                //     }
                // }
            }
            if (event === 'expand' && Array.isArray(expandedSections)) {
                const merged = [...new Set([...(existing.expandedSections as string[]), ...expandedSections])];
                updates.expandedSections = merged;
            }

            if (Object.keys(updates).length > 0) {
                await prisma.proposalView.update({
                    where: { id: existing.id },
                    data: updates,
                });
            }

            // TODO: Record dwell time and scroll depth in Deal Closer when prospectLead relation is available
            // if (prospectLead && (event === 'time' || event === 'scroll')) {
            //     try {
            //         const engagementEvent: EngagementEvent = {
            //             leadId: prospectLead.id,
            //             eventType: 'proposal_view',
            //             timestamp: new Date(),
            //             metadata: {
            //                 proposalId: proposal.id,
            //                 sessionId: body.sessionId,
            //                 dwellSeconds: timeOnPageSeconds,
            //                 scrollDepth: scrollDepth,
            //             },
            //         };
            //         await recordEvent(prospectLead.id, engagementEvent);
            //     } catch (error) {
            //         console.error('Failed to record engagement event:', error);
            //     }
            // }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    } catch (error) {
        console.error('Proposal track error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
