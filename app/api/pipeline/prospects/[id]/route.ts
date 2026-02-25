/**
 * Prospect Details API
 * 
 * GET: Retrieve full prospect context including audit, proposal, engagement, and state history
 * 
 * Requirements: 10.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getProspectContext } from '@/lib/pipeline/humanReview';
import { prisma } from '@/lib/db';

/**
 * GET /api/pipeline/prospects/[id]
 * Get full prospect context
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify prospect belongs to tenant
    const prospect = await prisma.prospectLead.findUnique({
      where: { id: id },
      select: { tenantId: true },
    });

    if (!prospect) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    if (prospect.tenantId !== session.user.tenantId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const context = await getProspectContext(id);

    if (!context) {
      return NextResponse.json(
        { error: 'Prospect not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(context);
  } catch (error) {
    console.error('Error fetching prospect details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
