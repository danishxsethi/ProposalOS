import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const flags = await prisma.humanReviewFlag.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ flags, count: flags.length });
  } catch (error) {
    console.error('Failed to get human review flags:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { flagId, status } = body;

    if (!flagId || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const flag = await prisma.humanReviewFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedBy: session.user.email,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ flag });
  } catch (error) {
    console.error('Failed to update human review flag:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
