import { NextRequest, NextResponse } from 'next/server';
import { matchLeadsToPartner, deliverLead } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/db';

/**
 * POST /api/cron/partner-matching
 * Match and deliver qualified leads to agency partners
 * Runs daily to identify leads matching partner preferences
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    let totalMatched = 0;
    let totalDelivered = 0;
    let errors = 0;

    // Get all active partners
    const partners = await prisma.agencyPartner.findMany({
      where: { isActive: true },
    });

    // For each partner, match and deliver leads
    for (const partner of partners) {
      try {
        const matches = await matchLeadsToPartner(partner.id);

        for (const match of matches) {
          try {
            await deliverLead(partner.id, match.leadId);
            totalDelivered++;
          } catch (error) {
            console.error(`Error delivering lead ${match.leadId} to partner ${partner.id}:`, error);
            errors++;
          }
        }

        totalMatched += matches.length;
      } catch (error) {
        console.error(`Error matching leads for partner ${partner.id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      totalMatched,
      totalDelivered,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Partner matching cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
