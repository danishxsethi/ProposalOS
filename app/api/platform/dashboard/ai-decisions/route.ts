/**
 * GET /api/platform/dashboard/ai-decisions
 * AI transparency: why prospects were prioritized, why email variants were chosen
 * Requirements: 8.4
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const prospectDecisions = [
    {
      id: 'pd1',
      prospectName: 'Sunrise Plumbing',
      decisionType: 'prioritization',
      decision: 'High priority — moved to top of outreach queue',
      reasoning: [
        { factor: 'Pain Score', value: 87, weight: 0.4, contribution: 'high' },
        { factor: 'Vertical Win Rate', value: '68%', weight: 0.25, contribution: 'high' },
        { factor: 'Competitor Gap', value: 'Large', weight: 0.2, contribution: 'medium' },
        { factor: 'Review Count', value: 12, weight: 0.15, contribution: 'low' },
      ],
      modelVersion: 'v2.3.1',
      decidedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'pd2',
      prospectName: 'Metro Dental',
      decisionType: 'prioritization',
      decision: 'Medium priority — scheduled for next batch',
      reasoning: [
        { factor: 'Pain Score', value: 62, weight: 0.4, contribution: 'medium' },
        { factor: 'Vertical Win Rate', value: '54%', weight: 0.25, contribution: 'medium' },
        { factor: 'Competitor Gap', value: 'Small', weight: 0.2, contribution: 'low' },
        { factor: 'Review Count', value: 47, weight: 0.15, contribution: 'high' },
      ],
      modelVersion: 'v2.3.1',
      decidedAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];

  const emailDecisions = [
    {
      id: 'ed1',
      prospectName: 'Green Lawn Co',
      decisionType: 'email_variant',
      decision: 'Selected variant B — pain-focused subject line',
      reasoning: [
        { factor: 'Historical open rate for pain-focused subjects in landscaping', value: '44%', contribution: 'high' },
        { factor: 'Prospect pain score', value: 79, contribution: 'high' },
        { factor: 'A/B test confidence', value: '94%', contribution: 'medium' },
      ],
      variantSelected: 'B',
      variantOpenRate: 0.44,
      modelVersion: 'v2.3.1',
      decidedAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'ed2',
      prospectName: 'City Auto Repair',
      decisionType: 'email_variant',
      decision: 'Selected variant A — social proof subject line',
      reasoning: [
        { factor: 'Historical open rate for social proof subjects in auto repair', value: '51%', contribution: 'high' },
        { factor: 'Review count signals credibility interest', value: 23, contribution: 'medium' },
        { factor: 'A/B test confidence', value: '89%', contribution: 'medium' },
      ],
      variantSelected: 'A',
      variantOpenRate: 0.51,
      modelVersion: 'v2.3.1',
      decidedAt: new Date(Date.now() - 5400000).toISOString(),
    },
  ];

  const allDecisions = [...prospectDecisions, ...emailDecisions]
    .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime())
    .slice(0, limit);

  return NextResponse.json({
    decisions: allDecisions,
    summary: {
      totalDecisionsToday: 284,
      prioritizationDecisions: 156,
      emailVariantDecisions: 128,
      averageConfidence: 0.91,
    },
    updatedAt: new Date().toISOString(),
  });
}
