/**
 * Human Review Queue API
 * 
 * GET: Retrieve review queue with filtering and pagination
 * POST: Approve or reject prospects
 * 
 * Requirements: 10.3, 10.4, 10.5
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getReviewQueue,
  approveProspect,
  rejectProspect,
  type ReviewQueueFilters,
} from '@/lib/pipeline/humanReview';

/**
 * GET /api/pipeline/review
 * Get review queue with filtering, sorting, and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const filters: ReviewQueueFilters = {
      status: searchParams.get('status')?.split(','),
      vertical: searchParams.get('vertical')?.split(','),
      minPainScore: searchParams.get('minPainScore') 
        ? parseInt(searchParams.get('minPainScore')!) 
        : undefined,
      maxPainScore: searchParams.get('maxPainScore')
        ? parseInt(searchParams.get('maxPainScore')!)
        : undefined,
      minEngagementScore: searchParams.get('minEngagementScore')
        ? parseInt(searchParams.get('minEngagementScore')!)
        : undefined,
      sortBy: (searchParams.get('sortBy') as any) || 'engagementScore',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!) : 20,
    };

    const queue = await getReviewQueue(session.user.tenantId, filters);

    return NextResponse.json(queue);
  } catch (error) {
    console.error('Error fetching review queue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pipeline/review
 * Approve or reject a prospect
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId || !session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has permission to review
    if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { prospectId, action, reason, notes } = body;

    if (!prospectId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: prospectId, action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    const reviewAction = {
      prospectId,
      action,
      operatorId: session.user.id,
      operatorEmail: session.user.email,
      reason,
      notes,
    };

    if (action === 'approve') {
      await approveProspect(reviewAction);
    } else {
      await rejectProspect(reviewAction);
    }

    return NextResponse.json({
      success: true,
      message: `Prospect ${action}d successfully`,
    });
  } catch (error) {
    console.error('Error processing review action:', error);
    
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
