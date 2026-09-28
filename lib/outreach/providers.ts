import { createHmac, timingSafeEqual } from 'node:crypto';

import { Resend } from 'resend';

import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

export type OutreachProviderName = 'resend' | 'zoho_smtp';

export interface SendProviderInput {
  from: string;
  fromName: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendProviderResult {
  messageId: string;
  provider: OutreachProviderName;
  state: 'ACCEPTED_BY_PROVIDER';
}

export interface SendProvider {
  readonly name: OutreachProviderName;
  send(input: SendProviderInput): Promise<SendProviderResult>;
}

const DEFAULT_MAILBOX_CAP = 35;

export function getOutreachProviderName(): OutreachProviderName {
  const configured = process.env.OUTREACH_PROVIDER?.trim().toLowerCase();
  return configured === 'zoho_smtp' ? 'zoho_smtp' : 'resend';
}

export function outreachSendingEnabled(): boolean {
  return (
    process.env.OUTREACH_LIVE_SENDING === 'true' &&
    process.env.OUTBOUND_DELIVERY_ENABLED === 'true'
  );
}

export function getMailboxDailyCap(): number {
  const configured = Number(process.env.OUTREACH_MAILBOX_DAILY_CAP || DEFAULT_MAILBOX_CAP);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 40) : DEFAULT_MAILBOX_CAP;
}

function getResendProvider(): SendProvider {
  return {
    name: 'resend',
    async send(input) {
      assertLiveProviderReady();
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error('RESEND_API_KEY is required for the Resend provider');
      const resend = new Resend(key);
      const messageId = await withProviderResilience(
        { provider: 'resend', operation: 'outreach:send' },
        async () => {
          const response = await resend.emails.send({
            from: `${input.fromName} <${input.from}>`,
            to: input.to,
            replyTo: input.replyTo,
            subject: input.subject,
            html: input.html,
            text: input.text,
            tags: input.tags,
          });
          if (response.error) throw new Error(response.error.message || 'Resend send failed');
          if (!response.data?.id) throw new Error('Resend returned no message ID');
          return response.data.id;
        }
      );
      return { messageId, provider: 'resend', state: 'ACCEPTED_BY_PROVIDER' };
    },
  };
}

function getZohoProvider(): SendProvider {
  return {
    name: 'zoho_smtp',
    async send(input) {
      assertLiveProviderReady();
      const host = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
      const port = Number(process.env.ZOHO_SMTP_PORT || 465);
      const user = process.env.ZOHO_SMTP_USER;
      const pass = process.env.ZOHO_SMTP_PASS;
      if (!user || !pass) {
        throw new Error('ZOHO_SMTP_USER and ZOHO_SMTP_PASS are required for Zoho SMTP');
      }

      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        pool: true,
        maxConnections: 1,
        maxMessages: getMailboxDailyCap(),
      });

      const info = await transport.sendMail({
        from: `${input.fromName} <${input.from}>`,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: { 'X-Claraud-Provider': 'zoho_smtp' },
      });
      await transport.close();
      if (!info.messageId) throw new Error('Zoho SMTP returned no message ID');
      return { messageId: info.messageId, provider: 'zoho_smtp', state: 'ACCEPTED_BY_PROVIDER' };
    },
  };
}

export function getSendProvider(): SendProvider {
  return getOutreachProviderName() === 'zoho_smtp' ? getZohoProvider() : getResendProvider();
}

export function assertLiveProviderReady(): void {
  if (!outreachSendingEnabled()) {
    throw new Error(
      'Outbound delivery refused: OUTREACH_LIVE_SENDING and OUTBOUND_DELIVERY_ENABLED must both be true'
    );
  }
}

/** Fail-safe Resend inbound webhook authentication; returns no body on failure. */
export function verifyResendWebhook(rawBody: string, webhookId: string, timestamp: string, signatureHeader: string, secret: string): boolean {
  if (!webhookId || !timestamp || !signatureHeader || !/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const encodedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, 'base64'); } catch { return false; }
  const expected = createHmac('sha256', key).update(`${webhookId}.${timestamp}.${rawBody}`).digest();
  return signatureHeader.split(' ').some((entry) => {
    const value = entry.split(',')[1];
    if (!value) return false;
    try {
      const provided = Buffer.from(value, 'base64');
      return expected.length === provided.length && timingSafeEqual(expected, provided);
    } catch { return false; }
  });
}
