/**
 * GET /api/v1/audits/:id/findings — Get audit findings
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
    include: { findings: true },
  });

  if (!audit || audit.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    auditId: audit.id,
    findings: audit.findings.map((f) => ({
      id: f.id,
      module: f.module,
      category: f.category,
      type: f.type,
      title: f.title,
      description: f.description,
      impactScore: f.impactScore,
      confidenceScore: f.confidenceScore,
      effortEstimate: f.effortEstimate,
    })),
  });
}
