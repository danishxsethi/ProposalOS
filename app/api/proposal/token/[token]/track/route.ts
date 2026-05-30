/**
 * POST /api/proposal/token/[token]/track
 * First-party analytics: view, scroll depth, time on page, CTA click, expanded sections.
 * Also feeds engagement data to Deal Closer for hot lead scoring.
 *
 * Features:
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { proposalTrackSchema } from '@/lib/api/schemas/proposal';
import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { recordEvent } from '@/lib/pipeline/dealCloser';
import type { EngagementEvent } from '@/lib/pipeline/types';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * Inner handler for tracking proposal engagement
 */
async function handleTrack(req: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const { token } = await params;
    const body = await req.json();

    // Validate request body
    const result = proposalTrackSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid tracking data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const {
      event,
      sessionId,
      scrollDepth,
      timeOnPageSeconds,
      ctaClicked,
      expandedSections,
      slideIndex,
    } = result.data;

    // Verify proposal exists
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: {
        audit: true,
      },
    });

    if (!proposal) {
      return NextResponse.json(new NotFoundError('Proposal', token).toEnvelope(req.url, traceId), {
        status: 404,
      });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
    const userAgent = req.headers.get('user-agent') || null;
    const referrer = req.headers.get('referer') || body.referrer || null;

    // Note: Prospect lead engagement tracking requires prospectLead relation in Audit model
    // Currently tracking via proposalView records only

    if (event === 'view') {
      // First view: create ProposalView record
      await prisma.proposalView.create({
        data: {
          proposalId: proposal.id,
          tenantId: proposal.audit.tenantId || 'system',
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

      // Future: Record engagement event in Deal Closer when prospectLead relation is available

      const response = NextResponse.json({ success: true });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }

    if (
      event === 'scroll' ||
      event === 'time' ||
      event === 'cta' ||
      event === 'expand' ||
      event === 'presentation_slide'
    ) {
      // Find existing view by sessionId
      const existing = await prisma.proposalView.findFirst({
        where: { proposalId: proposal.id, sessionId: body.sessionId },
        orderBy: { viewedAt: 'desc' },
      });

      if (!existing) {
        return NextResponse.json(
          new ValidationError('Session not found', [
            { field: 'sessionId', message: 'No tracking session found for this ID' },
          ]).toEnvelope(req.url, traceId),
          { status: 400 }
        );
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
        // Future: Record tier interaction in Deal Closer when prospectLead relation is available
      }
      if (event === 'expand' && Array.isArray(expandedSections)) {
        const merged = [
          ...new Set([...(existing.expandedSections as string[]), ...expandedSections]),
        ];
        updates.expandedSections = merged;
      }
      if (event === 'presentation_slide' && typeof slideIndex === 'number') {
        updates.lastPresentationSlide = slideIndex;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.proposalView.update({
          where: { id: existing.id },
          data: updates,
        });
      }

      // Future: Record dwell time and scroll depth in Deal Closer when prospectLead relation is available

      const response = NextResponse.json({ success: true });
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }

    return NextResponse.json(
      new ValidationError('Invalid event type', [
        { field: 'event', message: `Event '${event}' is not supported` },
      ]).toEnvelope(req.url, traceId),
      { status: 400 }
    );
  } catch (error) {
    const internalError = new InternalError('Failed to process tracking event', {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting (100 requests per minute for tracking events)
const rateLimitedHandler = (req: Request, params: Params) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many tracking events. Please slow down.',
  })(req, () => handleTrack(req, params));

export const POST = (req: Request, params: Params) => rateLimitedHandler(req, params);
