import { Resend } from 'resend';
import { logger } from '@/lib/logger';
import { BRANDING, getBrandColor } from '@/lib/config/branding';

// Initialize Resend with API key from env
// const resend = new Resend(process.env.RESEND_API_KEY); // Moved to lazy instantiation
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL;
const FROM_EMAIL = `${BRANDING.name} <notifications@resend.dev>`; // Default, user can change if they have domain

function getResend() {
    if (!process.env.RESEND_API_KEY) return null;
    return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Send "Proposal Ready" notification
 */
export async function sendProposalReady(
    auditId: string,
    businessName: string,
    proposalUrl: string
) {
    const resend = getResend();
    if (!OPERATOR_EMAIL || !resend) {
        logger.warn('Skipping email: OPERATOR_EMAIL or RESEND_API_KEY not set');
        return;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: OPERATOR_EMAIL,
            subject: `Proposal Ready: ${businessName}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h1>Proposal Ready 🚀</h1>
                    <p>The proposal for <strong>${businessName}</strong> has been generated successfully.</p>
                    <p>
                        <a href="${proposalUrl}" style="background-color: ${BRANDING.colors.primary}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                            View Proposal
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">Audit ID: ${auditId}</p>
                </div>
            `
        });

        if (error) {
            logger.error({ error }, 'Failed to send Proposal Ready email');
        } else {
            logger.info({ emailId: data?.id }, 'Sent Proposal Ready email');
        }
    } catch (e) {
        logger.error({ error: e }, 'Exception sending Proposal Ready email');
    }
}

/**
 * Send "Proposal Viewed" notification
 */
export async function sendProposalViewed(
    proposalId: string,
    businessName: string,
    viewedAt: Date
) {
    const resend = getResend();
    if (!OPERATOR_EMAIL || !resend) {
        return;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: OPERATOR_EMAIL,
            subject: `🔔 Proposal Viewed: ${businessName}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h1>Proposal Viewed! 👀</h1>
                    <p><strong>${businessName}</strong> just viewed their proposal.</p>
                    <p><strong>Time:</strong> ${viewedAt.toLocaleString()}</p>
                    <p style="background-color: #f0fdf4; color: #15803d; padding: 12px; border-radius: 4px; margin-top: 10px;">
                        This is a great time to follow up!
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">Proposal ID: ${proposalId}</p>
                </div>
            `
        });

        if (error) {
            logger.error({ error }, 'Failed to send Proposal Viewed email');
        } else {
            logger.info({ emailId: data?.id }, 'Sent Proposal Viewed email');
        }
    } catch (e) {
        logger.error({ error: e }, 'Exception sending Proposal Viewed email');
    }
}

interface BatchResult {
    total: number;
    completed: number;
    failed: number;
    batchId: string;
}

/**
 * Send "Batch Complete" notification
 */
export async function sendBatchComplete(results: BatchResult) {
    const resend = getResend();
    if (!OPERATOR_EMAIL || !resend) {
        return;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: OPERATOR_EMAIL,
            subject: `Batch Complete: ${results.completed}/${results.total} Audits`,
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h1>Batch Processing Complete ✅</h1>
                    <div style="display: flex; gap: 20px; margin: 20px 0;">
                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold;">${results.total}</div>
                            <div style="font-size: 14px; color: #666;">Total</div>
                        </div>
                        <div style="background: #dcfce7; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #166534;">${results.completed}</div>
                            <div style="font-size: 14px; color: #166534;">Success</div>
                        </div>
                        <div style="background: #fee2e2; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #991b1b;">${results.failed}</div>
                            <div style="font-size: 14px; color: #991b1b;">Failed</div>
                        </div>
                    </div>
                    <p>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/audit/batch/${results.batchId}" style="color: ${BRANDING.colors.primary};">
                            View Batch Details
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">Batch ID: ${results.batchId}</p>
                </div>
            `
        });

        if (error) {
            logger.error({ error }, 'Failed to send Batch Complete email');
        } else {
            logger.info({ emailId: data?.id }, 'Sent Batch Complete email');
        }
    } catch (e) {
        logger.error({ error: e }, 'Exception sending Batch Complete email');
    }
}
