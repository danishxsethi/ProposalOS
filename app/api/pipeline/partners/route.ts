import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { onboardPartner, getPartnerMetrics } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/db';

/**
 * GET /api/pipeline/partners
 * List all partners for the authenticated tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 });
    }

    // List all partners (partners are global, not tenant-specific)
    const partners = await prisma.agencyPartner.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactName: true,
        verticals: true,
        geographies: true,
        monthlyVolume: true,
        pricingModel: true,
        perLeadPriceCents: true,
        subscriptionPriceCents: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ partners });
  } catch (error) {
    console.error('Error listing partners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pipeline/partners
 * Create a new partner
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin access
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    const partnerId = await onboardPartner({
      name: body.name,
      contactEmail: body.contactEmail,
      contactName: body.contactName,
      verticals: body.verticals,
      geographies: body.geographies,
      monthlyVolume: body.monthlyVolume,
      pricingModel: body.pricingModel,
      perLeadPriceCents: body.perLeadPriceCents,
      subscriptionPriceCents: body.subscriptionPriceCents,
    });

    return NextResponse.json({ partnerId }, { status: 201 });
  } catch (error) {
    console.error('Error creating partner:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
