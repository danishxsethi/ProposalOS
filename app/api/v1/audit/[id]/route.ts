import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

export const GET = withAuth(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      await getTenantId();

      const { id } = await params;
      const audit = await prisma.audit.findUnique({
        where: { id },
        include: { findings: true },
      });

      if (!audit) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: audit.id,
        status: audit.status,
        businessName: audit.businessName,
        overallScore: audit.overallScore,
        findings: audit.findings.map((f) => ({
          type: f.type,
          title: f.title,
          score: f.impactScore,
          category: f.category,
        })),
      });
    } catch (error) {
      console.error('Error fetching audit details:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
);
