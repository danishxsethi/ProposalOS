/**
 * Prospect Status Override API
 * 
 * POST: Manually override a prospect's pipeline status
 * 
 * Requirements: 10.7
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { overrideProspectStatus } from '@/lib/pipeline/humanReview';
import { prisma } from '@/lib/db';

/**
 * POST /api/pipeline/prospects/[id]/override
 * Override prospect status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession();

    if (!session?.user?.tenantId || !session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has admin permission
    if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
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

    const body = await request.json();
    const { newStatus, reason } = body;

    if (!newStatus || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: newStatus, reason' },
        { status: 400 }
      );
    }

    await overrideProspectStatus(
      id,
      newStatus,
      session.user.id,
      session.user.email,
      reason
    );

    return NextResponse.json({
      success: true,
      message: 'Status overridden successfully',
    });
  } catch (error) {
    console.error('Error overriding prospect status:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
