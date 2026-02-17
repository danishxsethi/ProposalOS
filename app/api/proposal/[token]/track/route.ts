/**
 * POST /api/proposal/[token]/track
 * First-party analytics: view, scroll depth, time on page, CTA click, expanded sections.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const body = await req.json();

        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
        const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
        const userAgent = req.headers.get('user-agent') || null;
        const referrer = req.headers.get('referer') || body.referrer || null;

        const { event, sessionId, scrollDepth, timeOnPageSeconds, ctaClicked, expandedSections } = body;

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

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    } catch (error) {
        console.error('Proposal track error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
