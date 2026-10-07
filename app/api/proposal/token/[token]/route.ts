import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { checkRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import {
  PublicProposalAccessError,
  resolvePublicProposalAccess,
} from '@/lib/proposal/publicAccess';
import { hashSensitive } from '@/lib/security/abuseDefense/policies';
import { getTenantId } from '@/lib/tenant/context';

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

    let access;
    try {
      access = await resolvePublicProposalAccess(token);
    } catch (error) {
      if (!(error instanceof PublicProposalAccessError)) throw error;
      if (error.status !== 404) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
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
    const { proposal, tenantId } = access;

    // 2. Valid Token Usage: Token-hash-scoped scraping limit (100 requests per hour)

    const validLimit = await checkRateLimit(request, {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100,
      sessionId: token, // This hashes the token internally in buildRateLimitKey using hashSensitive(token)
      endpoint: 'valid_token_scrape',
      routeClass: 'token_download',
      auditOnBlock: true,
      failClosed: true,
      tenantId,
    });

    if (!validLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for this proposal.' },
        { status: 429, headers: { 'Retry-After': String(validLimit.retryAfter ?? 3600) } }
      );
    }

    // Public mutating channels permit customer actions only; status mutation remains authenticated.

    // Log proposal access for security monitoring (structured — no PII in message, token/IP redacted by logger)
    logger.info(
      { event: 'proposal.accessed', proposalId: access.proposalId },
      'Proposal accessed via public token'
    );

    return NextResponse.json({
      ...proposal,
      businessName: proposal.audit.businessName,
      businessCity: proposal.audit.businessCity,
      businessIndustry: proposal.audit.businessIndustry,
      findings: proposal.audit.findings,
    });
  } catch (error) {
    logger.error('[API] Error fetching proposal:', error);
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
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { status } = body;

    // Public share tokens may only record a view. Acceptance/rejection have
    // dedicated client actions; payment and close state are server-owned.
    const validStatuses = ['VIEWED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const existing = await prisma.proposal.findFirst({ where: { webLinkToken: token, tenantId } });
    if (!existing) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    if (status === 'VIEWED') {
      const { proposalId } = await resolvePublicProposalAccess(token);
      if (proposalId !== existing.id) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status === 'SENT') {
        updateData.sentAt = new Date();
      }
    }

    const proposal = await prisma.proposal.update({
      where: { id: existing.id, tenantId },
      data: updateData,
    });

    return NextResponse.json({
      id: proposal.id,
      status: proposal.status,
      sentAt: proposal.sentAt,
      viewedAt: proposal.viewedAt,
    });
  } catch (error) {
    logger.error('[API] Error updating proposal:', error);
    return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 });
  }
});
