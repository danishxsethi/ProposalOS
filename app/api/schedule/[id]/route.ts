import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

export const DELETE = withAuth(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const tenantId = await getTenantId();
      if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      await prisma.auditSchedule.delete({
        where: {
          id: id,
          tenantId, // Ensure ownership
        },
      });

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }
);

export const PATCH = withAuth(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const tenantId = await getTenantId();
      if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const body = await req.json();

      await prisma.auditSchedule.update({
        where: { id: id, tenantId },
        data: body, // simplified, validate specific fields in prod
      });

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }
);
