import { NextResponse } from 'next/server';

import { verifyResendWebhook } from '@/lib/outreach/providers';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

type ProviderEvent = { type?: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string }; complaint?: { type?: string } } };

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 64 * 1024) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const webhookId = request.headers.get('svix-id') ?? '';
  const timestamp = request.headers.get('svix-timestamp') ?? '';
  const signature = request.headers.get('svix-signature') ?? '';
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !verifyResendWebhook(rawBody, webhookId, timestamp, signature, secret)) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });

  let event: ProviderEvent;
  try { event = JSON.parse(rawBody) as ProviderEvent; } catch { return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 }); }
  const eventId = webhookId;
  const processed = await prisma.$transaction(async (tx) => {
    const inserted = await tx.processedOutboundWebhook.createMany({ data: [{ id: eventId, provider: 'resend', eventType: event.type ?? 'unknown', tenantId: null }], skipDuplicates: true });
    if (inserted.count === 0) return false;
    const messageId = event.data?.email_id;
    const outreach = messageId ? await tx.outreachEmail.findFirst({ where: { providerMessageId: messageId }, select: { id: true, tenantId: true, leadId: true, status: true } }) : null;
    if (outreach) {
      await runWithTenantAsync(outreach.tenantId, () => tx.outreachEmailEvent.create({ data: { tenantId: outreach.tenantId, leadId: outreach.leadId, emailId: outreach.id, type: event.type === 'email.bounced' ? 'BOUNCED' : event.type === 'email.complained' ? 'COMPLAINED' : 'DELIVERED', metadata: { providerEventId: eventId }, occurredAt: new Date(Number(timestamp) * 1000) } }));
      if (event.type === 'email.bounced' || event.type === 'email.complained') {
        await runWithTenantAsync(outreach.tenantId, () => tx.outreachEmail.update({ where: { id: outreach.id }, data: { status: event.type === 'email.bounced' ? 'BOUNCED' : 'COMPLAINED' } }));
        for (const recipient of event.data?.to ?? []) {
          if (recipient.includes('@')) await tx.emailBlocklist.upsert({ where: { email: recipient.toLowerCase() }, create: { email: recipient.toLowerCase(), reason: event.type === 'email.bounced' ? 'bounce' : 'complaint' }, update: { reason: event.type === 'email.bounced' ? 'bounce' : 'complaint' } });
        }
      }
    }
    return true;
  });
  return NextResponse.json({ received: true, deduplicated: !processed });
}
