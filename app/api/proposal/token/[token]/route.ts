import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

// Simple in-memory rate limiting (for demo purposes)
// In production, use Redis or database-based rate limiting
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;

  const record = rateLimitMap.get(identifier);

  if (!record) {
    rateLimitMap.set(identifier, { count: 1, timestamp: now });
    return false;
  }

  // Reset counter if window has passed
  if (now - record.timestamp > windowMs) {
    rateLimitMap.set(identifier, { count: 1, timestamp: now });
    return false;
  }

  // Check if limit exceeded
  if (record.count >= maxRequests) {
    return true;
  }

  // Increment count
  rateLimitMap.set(identifier, { count: record.count + 1, timestamp: record.timestamp });
  return false;
}

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

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

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
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // Log proposal access for security monitoring
    console.log(`[SECURITY] Proposal accessed: ${proposal.id} from IP: ${ip}`);

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

import { withAuth } from '@/lib/middleware/auth';

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
