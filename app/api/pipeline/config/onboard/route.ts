/**
 * Tenant Onboarding API
 * 
 * POST: Onboard a new tenant with default pipeline configuration
 * 
 * Requirements: 9.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { onboardTenant } from '@/lib/pipeline/tenantConfig';

/**
 * POST /api/pipeline/config/onboard
 * Onboard tenant with default configuration
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has admin role
    if (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const result = await onboardTenant(session.user.tenantId);

    return NextResponse.json({
      message: 'Tenant onboarded successfully',
      config: result.config,
      branding: result.branding,
    });
  } catch (error) {
    console.error('Error onboarding tenant:', error);
    
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
