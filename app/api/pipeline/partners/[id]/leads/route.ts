import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { matchLeadsToPartner, deliverLead, updateLeadStatus } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/db';

/**
 * GET /api/pipeline/partners/[id]/leads
 * Get delivered leads for a partner
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const partnerId = params.id;

    // Get delivered leads
    const deliveredLeads = await prisma.partnerDeliveredLead.findMany({
      where: { partnerId },
      select: {
        id: true,
        leadId: true,
        status: true,
        deliveredAt: true,
        updatedAt: true,
        packagedData: true,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    return NextResponse.json({ leads: deliveredLeads });
  } catch (error) {
    console.error('Error fetching partner leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pipeline/partners/[id]/leads
 * Deliver leads to a partner
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const partnerId = params.id;
    const body = await request.json();

    if (body.action === 'match') {
      // Match and deliver leads to partner
      const matches = await matchLeadsToPartner(partnerId);
      return NextResponse.json({ leads: matches });
    } else if (body.action === 'deliver' && body.leadId) {
      // Deliver specific lead
      const packagedLead = await deliverLead(partnerId, body.leadId);
      return NextResponse.json({ lead: packagedLead }, { status: 201 });
    } else if (body.action === 'updateStatus' && body.leadId && body.status) {
      // Update lead status
      await updateLeadStatus(partnerId, body.leadId, body.status);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing partner lead action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
