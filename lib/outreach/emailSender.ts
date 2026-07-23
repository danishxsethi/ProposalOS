import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

function getResend(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    return new Resend(key);
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
    tenantId
}: SendProposalOptions) {
    try {
        // 1. Check Blocklist
        const blocked = await prisma.emailBlocklist.findUnique({
            where: { email: recipientEmail }
        });
        if (blocked) {
            throw new Error('Recipient is on the blocklist');
        }

        // 2. Fetch Branding
        let brandName = 'ProposalOS';
        let fromEmail = 'updates@metricvoid.com'; // Default verified domain

        if (tenantId) {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                include: { brandingConfig: true }
            });
            if (tenant?.brandingConfig?.brandName) {
                brandName = tenant.brandingConfig.brandName;
            }
            // Dynamic from email requires domain verification on Resend side.
            // For now, we utilize the default valid domain but change the Display Name.
        }

        // 3. Construct Email
        // We'll wrap the messageHtml in a nice template
        const finalHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${brandName}</h2>
                <div style="padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    ${messageHtml}
                </div>
                <div style="margin-top: 20px; font-size: 12px; color: #888; text-align: center;">
                    <p>Sent via ${brandName}</p>
                    <p><a href="${process.env.NEXTAUTH_URL}/api/unsubscribe/${proposalId}" style="color: #888;">Unsubscribe</a></p>
                </div>
            </div>
        `;

        // 4. Send via Resend
        const resend = getResend();
        if (!resend) {
            throw new Error('RESEND_API_KEY is required to send emails');
        }
        const data = await resend.emails.send({
            from: `${brandName} <${fromEmail}>`,
            to: recipientEmail,
            subject: subject,
            html: finalHtml,
            tags: [
                { name: 'category', value: 'proposal' },
                { name: 'proposal_id', value: proposalId },
                { name: 'tenant_id', value: tenantId || 'system' }
            ]
        });

        if (data.error) {
            throw new Error(data.error.message);
        }

        // 5. Update Database
        await prisma.$transaction([
            // Create Outreach Record
            prisma.proposalOutreach.create({
                data: {
                    proposalId,
                    recipientEmail,
                    emailSubject: subject,
                    emailBody: messageHtml,
                    tenantId,
                    sentAt: new Date()
                }
            }),
            // Update Proposal Status
            prisma.proposal.update({
                where: { id: proposalId },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    prospectEmail: recipientEmail // Update main record too for easy access
                }
            })
        ]);

        return { success: true, messageId: data.data?.id };

    } catch (error) {
        logger.error({ err: error, proposalId, recipientEmail }, 'Failed to send proposal email');
        throw error;
    }
}
