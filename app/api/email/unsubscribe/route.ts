import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const reason = searchParams.get('reason') || 'unsubscribe';

    if (!email) {
      return new NextResponse('Email parameter is required', { status: 400 });
    }

    // Add to email blocklist
    await prisma.emailBlocklist.upsert({
      where: { email },
      update: { reason },
      create: { email, reason },
    });

    // Optional: Cancel any pending follow-ups for this email
    // Find leads associated with this email
    const leads = await prisma.prospectLead.findMany({
      where: { decisionMakerEmail: email },
      select: { id: true },
    });

    if (leads.length > 0) {
      const leadIds = leads.map((l: any) => l.id);

      // Mark pending outreach emails as suppressed
      await prisma.outreachEmail.updateMany({
        where: {
          leadId: { in: leadIds },
          status: 'PENDING',
        },
        data: { status: 'SUPPRESSED' },
      });

      // Log event for the first matching lead
      if (leads[0]) {
        const lead = await prisma.prospectLead.findUnique({
          where: { id: leads[0].id },
          select: { tenantId: true },
        });

        if (lead?.tenantId) {
          await prisma.outreachEmailEvent.create({
            data: {
              tenantId: lead.tenantId,
              leadId: leads[0].id,
              type: 'LEAD_DROPPED',
              metadata: { reason: 'unsubscribed' },
            },
          });
        }
      }
    }

    logger.info({ event: 'email.unsubscribed', email }, 'User unsubscribed successfully');

    // Render a simple unsubscribe success page
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Unsubscribed</title>
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f9fafb; }
                .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
                h1 { color: #111827; margin-top: 0; }
                p { color: #4b5563; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Unsubscribed Successfully</h1>
                <p>You have been successfully removed from our mailing list. You will not receive any further emails from us at <strong>${email}</strong>.</p>
            </div>
        </body>
        </html>
        `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    logger.error({ error, event: 'email.unsubscribe.error' }, 'Error processing unsubscribe');
    return new NextResponse('Internal server error', { status: 500 });
  }
}
