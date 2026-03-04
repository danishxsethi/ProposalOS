import { Resend } from 'resend';

// Only create Resend client if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendReportEmail({
    to,
    businessName,
    overallScore,
    letterGrade,
    topFindings,
    reportUrl,
}: {
    to: string;
    businessName: string;
    overallScore: number;
    letterGrade: string;
    topFindings: { title: string; severity: string }[];
    reportUrl: string;
}) {
    // Only send if RESEND_API_KEY is configured
    if (!process.env.RESEND_API_KEY || !resend) {
        console.log('[Resend] Skipping email — no API key configured');
        return;
    }

    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Claraud <audit@claraud.com>',
        to,
        subject: `Your ${businessName} Audit Report is Ready`,
        html: generateReportEmailHtml({ businessName, overallScore, letterGrade, topFindings, reportUrl }),
    });
}

function generateReportEmailHtml({
    businessName,
    overallScore,
    letterGrade,
    topFindings,
    reportUrl,
}: {
    businessName: string;
    overallScore: number;
    letterGrade: string;
    topFindings: { title: string; severity: string }[];
    reportUrl: string;
}) {
    // Color code based on score
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#22c55e'; // green
        if (score >= 60) return '#3b82f6'; // blue
        if (score >= 40) return '#f59e0b'; // yellow
        if (score >= 20) return '#f97316'; // orange
        return '#ef4444'; // red
    };

    const scoreColor = getScoreColor(overallScore);

    // Generate findings HTML
    const findingsHtml = topFindings
        .slice(0, 3)
        .map(
            (f) => `
            <li style="margin-bottom: 8px; color: #9ca3af; font-size: 14px;">
                <span style="color: ${getSeverityColor(f.severity)}; font-weight: 600;">${f.severity.toUpperCase()}:</span> ${f.title}
            </li>
        `
        )
        .join('');

    function getSeverityColor(severity: string) {
        switch (severity) {
            case 'critical':
                return '#ef4444';
            case 'high':
                return '#f97316';
            case 'medium':
                return '#f59e0b';
            default:
                return '#6b7280';
        }
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #f9fafb;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="font-size: 28px; font-weight: 800; margin: 0;">claraud</h1>
                    <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">AI Business Audit Platform</p>
                </div>

                <!-- Greeting -->
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                    Hi there,
                </p>
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
                    Your audit of <strong style="color: #f9fafb;">${businessName}</strong> is complete.
                </p>

                <!-- Score Display -->
                <div style="background: #111827; border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 32px; border: 1px solid #374151;">
                    <div style="font-size: 72px; font-weight: 900; background: linear-gradient(135deg, ${scoreColor}, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px;">
                        ${overallScore}
                    </div>
                    <div style="font-size: 24px; font-weight: 700; color: #f9fafb; margin-bottom: 8px;">
                        ${letterGrade}
                    </div>
                    <p style="color: #9ca3af; margin: 0; font-size: 14px;">Overall Business Health Score</p>
                </div>

                <!-- Top Findings -->
                <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 16px 0; color: #f9fafb;">Top Findings:</h3>
                <ul style="list-style: none; padding: 0; margin: 0 0 32px 0;">
                    ${findingsHtml}
                </ul>

                <!-- CTA Button -->
                <a href="${reportUrl}" style="display: block; text-align: center; background: linear-gradient(135deg, ${scoreColor}, #8b5cf6); color: white; font-weight: 700; padding: 16px 32px; border-radius: 999px; text-decoration: none; font-size: 16px; margin-bottom: 32px;">
                    View Full Report →
                </a>

                <!-- Footer -->
                <div style="border-top: 1px solid #374151; padding-top: 24px; text-align: center;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0;">
                        Claraud — AI Business Audit
                    </p>
                    <p style="color: #4b5563; font-size: 12px; margin-top: 8px;">
                        <a href="${reportUrl}/unsubscribe" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> | 
                        <a href="https://claraud.com" style="color: #6b7280; text-decoration: underline;">Website</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
    `;
}