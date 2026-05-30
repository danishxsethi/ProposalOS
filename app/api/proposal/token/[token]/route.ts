import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { checkRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';

interface Params {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/proposal/token/[token]
 * Get proposal data by web link token (public endpoint)
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { token } = await params;

    // Find proposal by token first
    const proposal = await prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: {
        audit: {
          include: {
            findings: {
              where: { excluded: false },
              orderBy: { impactScore: 'desc' },
            },
          },
        },
      },
    });

    if (!proposal) {
      // 1. Invalid Token Attempt: IP-scoped strict rate limit (10 attempts per hour)
      const invalidLimit = await checkRateLimit(request, {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10,
        endpoint: 'invalid_token_attempt',
        routeClass: 'token_download',
        auditOnBlock: false, // We will audit explicitly to use the correct eventType
        failClosed: true,
      });

      if (!invalidLimit.success) {
        const forwarded = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const ip = forwarded?.split(',')[0]?.trim() ?? realIp?.split(',')[0]?.trim() ?? 'unknown';

        await recordAuditTrailEvent({
          eventType: 'abuse.invalid_token_rate_limited',
          tenantId: null,
          payload: {
            routeClass: 'token_download',
            ipHash: hashSensitive(ip),
            endpoint: request.url,
            limit: 10,
            retryAfter: invalidLimit.retryAfter ?? 3600,
          },
        }).catch(() => {});

        return NextResponse.json(
          { error: 'Too many invalid attempts. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(invalidLimit.retryAfter ?? 3600) } }
        );
      }

      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // 2. Valid Token Usage: Token-hash-scoped scraping limit (100 requests per hour)

    const validLimit = await checkRateLimit(request, {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100,
      sessionId: token, // This hashes the token internally in buildRateLimitKey using hashSensitive(token)
      endpoint: 'valid_token_scrape',
      routeClass: 'token_download',
      auditOnBlock: true,
      failClosed: true,
      tenantId: proposal.tenantId,
    });

    if (!validLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for this proposal.' },
        { status: 429, headers: { 'Retry-After': String(validLimit.retryAfter ?? 3600) } }
      );
    }

    // Verify expiration: Status is REJECTED or older than 90 days
    if (proposal.status === 'REJECTED') {
      return NextResponse.json({ error: 'Proposal has been rejected' }, { status: 410 });
    }

    const ageMs = Date.now() - proposal.createdAt.getTime();
    const expiryMs = 90 * 24 * 60 * 60 * 1000; // 90 days
    if (ageMs > expiryMs) {
      return NextResponse.json({ error: 'Proposal has expired' }, { status: 410 });
    }

    // Log proposal access for security monitoring (structured — no PII in message, token/IP redacted by logger)
    logger.info(
      { event: 'proposal.accessed', proposalId: proposal.id },
      'Proposal accessed via public token'
    );

    return NextResponse.json({
      id: proposal.id,
      businessName: proposal.audit.businessName,
      businessCity: proposal.audit.businessCity,
      businessIndustry: proposal.audit.businessIndustry,
      executiveSummary: proposal.executiveSummary,
      painClusters: proposal.painClusters,
      findings: proposal.audit.findings,
      pricing: proposal.pricing,
      tiers: {
        essentials: proposal.tierEssentials,
        growth: proposal.tierGrowth,
        premium: proposal.tierPremium,
      },
      tierEssentials: proposal.tierEssentials,
      tierGrowth: proposal.tierGrowth,
      tierPremium: proposal.tierPremium,
      nextSteps: proposal.nextSteps,
      assumptions: proposal.assumptions,
      disclaimers: proposal.disclaimers,
      qaScore: proposal.qaScore,
      clientScore: proposal.clientScore,
      clientScoreResults: proposal.clientScoreResults,
      humanCloseabilityScore: proposal.humanCloseabilityScore,
      replyReceivedAt: proposal.replyReceivedAt,
      meetingBookedAt: proposal.meetingBookedAt,
      tierChosen: proposal.tierChosen,
      viewedAt: proposal.viewedAt,
      createdAt: proposal.createdAt,
    });
  } catch (error) {
    console.error('[API] Error fetching proposal:', error);
    return NextResponse.json({ error: 'Failed to fetch proposal' }, { status: 500 });
  }
}

/**
 * PATCH /api/proposal/token/[token]
 * Update proposal status (e.g., mark as sent)
 */
export const PATCH = withAuth(async (request: Request, { params }: Params) => {
  try {
    const { token } = await params;
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['DRAFT', 'READY', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status === 'SENT') {
        updateData.sentAt = new Date();
      }
    }

    const proposal = await prisma.proposal.update({
      where: { webLinkToken: token },
      data: updateData,
    });

    return NextResponse.json({
      id: proposal.id,
      status: proposal.status,
      sentAt: proposal.sentAt,
      viewedAt: proposal.viewedAt,
    });
  } catch (error) {
    console.error('[API] Error updating proposal:', error);
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 });
  }
});
