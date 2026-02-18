/**
 * API Endpoint: Pipeline Learning Loop
 * 
 * Provides manual triggers and insights queries for the learning loop.
 * 
 * Requirements: 8.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  recalibratePricing,
  getVerticalInsights,
  type PricingCalibration,
  type VerticalInsights,
} from '@/lib/pipeline/learningLoop';

/**
 * GET /api/pipeline/learning
 * 
 * Query vertical insights or pricing calibration
 * 
 * Query params:
 * - action: 'insights' | 'pricing'
 * - vertical: string (required)
 * - city: string (required for pricing)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const vertical = searchParams.get('vertical');
    const city = searchParams.get('city');

    if (!action) {
      return NextResponse.json(
        { error: 'Missing required parameter: action' },
        { status: 400 }
      );
    }

    if (!vertical) {
      return NextResponse.json(
        { error: 'Missing required parameter: vertical' },
        { status: 400 }
      );
    }

    if (action === 'insights') {
      // Query vertical insights
      const insights: VerticalInsights = await getVerticalInsights(vertical);
      return NextResponse.json({ insights });
    } else if (action === 'pricing') {
      // Query pricing calibration
      if (!city) {
        return NextResponse.json(
          { error: 'Missing required parameter: city (required for pricing action)' },
          { status: 400 }
        );
      }

      const calibration: PricingCalibration = await recalibratePricing(vertical, city);
      return NextResponse.json({ calibration });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "insights" or "pricing"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API] Pipeline learning error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pipeline/learning
 * 
 * Manually trigger pricing recalibration
 * 
 * Body:
 * - vertical: string (required)
 * - city: string (required)
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { vertical, city } = body;

    if (!vertical) {
      return NextResponse.json(
        { error: 'Missing required field: vertical' },
        { status: 400 }
      );
    }

    if (!city) {
      return NextResponse.json(
        { error: 'Missing required field: city' },
        { status: 400 }
      );
    }

    // Trigger pricing recalibration
    const calibration: PricingCalibration = await recalibratePricing(vertical, city);

    return NextResponse.json({
      success: true,
      message: `Pricing recalibrated for ${vertical} in ${city}`,
      calibration,
    });
  } catch (error) {
    console.error('[API] Pipeline learning POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
