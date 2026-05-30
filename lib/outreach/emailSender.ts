import { Resend } from 'resend';

import { recordIntegrationFailure, recordIntegrationSuccess } from '@/lib/integrations';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
}

export async function sendEmail({
  to,
  subject,
  body,
  fromName = 'ProposalOS',
  fromEmail = 'updates@metricvoid.com',
}: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is required to send emails' };
  }

  try {
    const messageId = await withProviderResilience(
      {
        provider: 'resend',
        operation: 'send-outreach-email',
      },
      async () => {
        const data = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to,
          subject,
          html: body,
        });

        if (data.error) {
          throw new Error(data.error.message);
        }

        recordIntegrationSuccess('RESEND');
        return data.data?.id;
      }
    );

    return { success: true, messageId };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    recordIntegrationFailure('RESEND', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

interface SendProposalOptions {
  proposalId: string;
  recipientEmail: string;
  subject: string;
  messageHtml: string; // The custom body part
  tenantId?: string;
}

export async function sendProposalEmail({
  proposalId,
  recipientEmail,
  subject,
  messageHtml,
  tenantId,
}: SendProposalOptions) {
  // 1. Check Blocklist
  const blocked = await prisma.emailBlocklist.findUnique({
    where: { email: recipientEmail },
  });
  if (blocked) {
    throw new Error('Recipient is on the blocklist');
  }

  // 2. Fetch Branding
  let brandName = 'ProposalOS';
  const fromEmail = 'updates@metricvoid.com'; // Default verified domain

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { brandingConfig: true },
    });
    if (tenant?.brandingConfig?.brandName) {
      brandName = tenant.brandingConfig.brandName;
    }
  }

  // 3. Construct Email with CAN-SPAM compliant footer
  const physicalAddress = process.env.COMPANY_PHYSICAL_ADDRESS || 
                          'ProposalOS\n123 Business Street, Suite 100\nCity, ST 12345\nUnited States';
  
  const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'https://proposalos.com'}/api/email/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;
  
  const finalHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${brandName}</h2>
                <div style="padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    ${messageHtml}
                </div>
                <div style="margin-top: 20px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
                    <p style="margin: 0 0 10px 0;">Sent via ${brandName}</p>
                    <p style="margin: 0 0 10px 0;"><a href="${unsubscribeUrl}" style="color: #888; text-decoration: underline;">Unsubscribe</a> from future emails</p>
                    <p style="margin: 0; color: #aaa; font-size: 11px;">
                        ${brandName}<br/>
                        ${physicalAddress.replace(/\n/g, '<br/>')}
                    </p>
                </div>
            </div>
        `;

  // 4. Send via Resend with retry logic wrapped in provider resilience
  const resend = getResend();
  if (!resend) {
    throw new Error('RESEND_API_KEY is required to send emails');
  }

  let messageId: string | undefined;
  try {
    messageId = await withProviderResilience(
      {
        provider: 'resend',
        operation: 'send-proposal-email',
        tenantId,
      },
      async () => {
        const data = await resend.emails.send({
          from: `${brandName} <${fromEmail}>`,
          to: recipientEmail,
          subject: subject,
          html: finalHtml,
          tags: [
            { name: 'category', value: 'proposal' },
            { name: 'proposal_id', value: proposalId },
            { name: 'tenant_id', value: tenantId || 'system' },
          ],
        });

        if (data.error) {
          throw new Error(data.error.message);
        }

        recordIntegrationSuccess('RESEND');
        return data.data?.id;
      }
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    recordIntegrationFailure('RESEND', error);
    logger.error({ err: error, proposalId, recipientEmail }, 'Failed to send proposal email after retries');
    throw error;
  }

  // 5. Update Database
  await prisma.$transaction([
    prisma.proposalOutreach.create({
      data: {
        proposalId,
        recipientEmail,
        emailSubject: subject,
        emailBody: messageHtml,
        tenantId: tenantId ?? '',
        sentAt: new Date(),
      },
    }),
    prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        prospectEmail: recipientEmail,
      },
    }),
  ]);

  return { success: true, messageId };
}

