/**
 * POST /api/v1/outreach/:leadId — Trigger outreach for a lead
 * Requirements: 9.1, 9.3, 9.8
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/platform/api/middleware';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.permissions.includes('write') && !auth.permissions.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden', message: 'write permission required' }, { status: 403 });
  }

  const { leadId } = await params;

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // Mark lead as ready for outreach
  const updated = await prisma.prospectLead.update({
    where: { id: leadId },
    data: {
      outreachStage: 'READY',
      outreachNextActionAt: new Date(),
    },
  });

  return NextResponse.json({
    leadId: updated.id,
    outreachStage: updated.outreachStage,
    scheduledAt: updated.outreachNextActionAt,
    message: 'Outreach triggered successfully',
  });
}
