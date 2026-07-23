/**
 * GET /api/v1/clients/:id — Get client details
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

  const client = await prisma.prospectLead.findUnique({
    where: { id },
    include: {
      outreachEmails: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          status: true,
          sentAt: true,
          openedAt: true,
        },
      },
    },
  });

  if (!client || client.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    id: client.id,
    businessName: client.businessName,
    city: client.city,
    state: client.state,
    vertical: client.vertical,
    website: client.website,
    phone: client.phone,
    status: client.status,
    pipelineStatus: client.pipelineStatus,
    painScore: client.painScore,
    outreachStage: client.outreachStage,
    outreachAttempts: client.outreachAttempts,
    auditId: client.auditId,
    proposalId: client.proposalId,
    recentEmails: client.outreachEmails,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  });
}
