/**
 * GET /api/v1/audits/:id/proposal — Get generated proposal for an audit
 * Requirements: 9.1, 9.3, 9.8
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/platform/api/middleware';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id },
    include: {
      proposals: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!audit || audit.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const proposal = audit.proposals[0];
  if (!proposal) {
    return NextResponse.json(
      { error: 'Not Found', message: 'No proposal generated for this audit yet' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: proposal.id,
    auditId: audit.id,
    status: proposal.status,
    executiveSummary: proposal.executiveSummary,
    pricing: proposal.pricing,
    pdfUrl: proposal.pdfUrl,
    webLinkToken: proposal.webLinkToken,
    sentAt: proposal.sentAt,
    viewedAt: proposal.viewedAt,
    createdAt: proposal.createdAt,
  });
}
