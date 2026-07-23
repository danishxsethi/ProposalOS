/**
 * GET /api/v1/clients — List clients (prospect leads) for the tenant
 * Requirements: 9.1, 9.3, 9.8
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/platform/api/middleware';

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const skip = (page - 1) * limit;

  const [clients, total] = await Promise.all([
    prisma.prospectLead.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        businessName: true,
        city: true,
        state: true,
        vertical: true,
        status: true,
        pipelineStatus: true,
        painScore: true,
        outreachStage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.prospectLead.count({ where: { tenantId: auth.tenantId } }),
  ]);

  return NextResponse.json({
    data: clients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
