/**
 * POST /api/v1/audits — Create a new audit
 * Requirements: 9.1, 9.3, 9.8
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/platform/api/middleware';

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.permissions.includes('write') && !auth.permissions.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden', message: 'write permission required' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { businessName, businessUrl, city, industry } = body as {
    businessName?: string;
    businessUrl?: string;
    city?: string;
    industry?: string;
  };

  if (!businessName || !businessUrl) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'businessName and businessUrl are required' },
      { status: 400 }
    );
  }

  const audit = await prisma.audit.create({
    data: {
      tenantId: auth.tenantId,
      businessName: String(businessName),
      businessUrl: String(businessUrl),
      businessCity: city ? String(city) : null,
      businessIndustry: industry ? String(industry) : 'Generic',
      status: 'QUEUED',
      startedAt: new Date(),
      apiCostCents: 0,
    },
  });

  return NextResponse.json(
    {
      id: audit.id,
      status: audit.status,
      businessName: audit.businessName,
      createdAt: audit.createdAt,
      message: 'Audit queued for processing',
    },
    { status: 201 }
  );
}
