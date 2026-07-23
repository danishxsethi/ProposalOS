/**
 * GET /api/v1/audits/:id — Get audit status and results
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
  });

  if (!audit || audit.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    id: audit.id,
    status: audit.status,
    businessName: audit.businessName,
    businessUrl: audit.businessUrl,
    businessCity: audit.businessCity,
    businessIndustry: audit.businessIndustry,
    overallScore: audit.overallScore,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
    createdAt: audit.createdAt,
  });
}
