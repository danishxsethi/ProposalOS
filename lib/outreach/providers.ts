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
      return { messageId, provider: 'resend' };
    },
  };
}

function getZohoProvider(): SendProvider {
  return {
    name: 'zoho_smtp',
    async send(input) {
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
      return { messageId: info.messageId, provider: 'zoho_smtp' };
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
