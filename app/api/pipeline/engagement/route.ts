import { NextResponse } from 'next/server';
import { recordEvent } from '@/lib/pipeline/dealCloser';
import type { EngagementEvent } from '@/lib/pipeline/types';

/**
 * Engagement Tracking API Endpoint
 * 
 * Receives webhook events for email opens, clicks, and proposal views
 * and records them in the Deal Closer for engagement scoring.
 * 
 * This endpoint is called by:
 * - Email tracking pixels (opens)
 * - Email link redirects (clicks)
 * - Proposal page analytics (views, scroll depth, tier interactions)
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, eventType, timestamp, metadata } = body;

    // Validate required fields
    if (!leadId || !eventType) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, eventType' },
        { status: 400 }
      );
    }

    // Validate event type
    const validEventTypes = ['email_open', 'email_click', 'proposal_view', 'tier_interaction'];
    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid event type: ${eventType}. Must be one of: ${validEventTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create engagement event
    const event: EngagementEvent = {
      leadId,
      eventType,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      metadata: metadata || {},
    };

    // Record the event
    await recordEvent(leadId, event);

    return NextResponse.json({
      success: true,
      message: 'Engagement event recorded',
      leadId,
      eventType,
    });
  } catch (error) {
    console.error('Engagement tracking error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for testing/health check
 */
export async function GET() {
  return NextResponse.json({
    service: 'engagement-tracking',
    status: 'operational',
    supportedEvents: ['email_open', 'email_click', 'proposal_view', 'tier_interaction'],
  });
}
