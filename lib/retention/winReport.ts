/**
 * FIX-11: Win reports.
 * Generates a client-facing summary of everything that was fixed,
 * then emails it automatically after each monthly re-audit.
 */

import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { DeltaReport } from './deltaReport';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WinReportResult {
    fixedCount: number;
    healthImprovement: number;
    emailSent: boolean;
}

/**
 * Sends a "What we fixed this month" win report email to the client.
 */
export async function sendWinReport(
    deltaReport: DeltaReport,
    clientEmail: string,
    tenantId: string,
    dashboardUrl: string
): Promise<WinReportResult> {
    const { fixedCount, newCount, healthImprovement, findings, currentAuditId } = deltaReport;

    // Fetch branding
    let brandName = 'ProposalOS';
    let fromEmail = process.env.DEFAULT_FROM_EMAIL ?? 'noreply@proposalos.com';
    try {
        const branding = await prisma.tenantBranding.findUnique({
            where: { tenantId },
            select: { brandName: true, contactEmail: true },
        });
        if (branding?.brandName) brandName = branding.brandName;
        if (branding?.contactEmail) fromEmail = branding.contactEmail;
    } catch { /* use defaults */ }

    if (fixedCount === 0) {
        logger.info({ currentAuditId }, 'Win report: no fixes to report, skipping email');
        return { fixedCount: 0, healthImprovement, emailSent: false };
    }

    const fixedFindings = findings.filter(f => f.trend === 'FIXED');
    const fixedItemsHtml = fixedFindings
        .slice(0, 10) // Cap at 10 for email readability
        .map(f => `<li style="margin-bottom:8px;">✅ <strong>${f.title}</strong> <span style="color:#555;font-size:13px;">(${f.category})</span></li>`)
        .join('');

    const healthBadge = healthImprovement > 0
        ? `<span style="color:#22c55e;font-weight:700;">+${healthImprovement} pts</span>`
        : `<span style="color:#f59e0b;font-weight:700;">${healthImprovement} pts</span>`;

    const newIssuesNote = newCount > 0
        ? `<p style="background:#fff7ed;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        ℹ️ We also discovered <strong>${newCount} new issue${newCount > 1 ? 's' : ''}</strong> this month. 
        <a href="${dashboardUrl}" style="color:#8B5CF6;">View them in your dashboard →</a>
       </p>`
        : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #8B5CF6;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:22px;color:#8B5CF6;">${brandName}</h1>
  </div>

  <h2 style="font-size:20px;">🏆 Monthly Win Report</h2>
  <p>Here's what we accomplished for you this month:</p>

  <div style="display:flex;gap:16px;margin:20px 0;">
    <div style="flex:1;background:#f5f3ff;padding:16px;border-radius:8px;text-align:center;">
      <div style="font-size:32px;font-weight:700;color:#8B5CF6;">${fixedCount}</div>
      <div style="font-size:13px;color:#555;">Issues Fixed</div>
    </div>
    <div style="flex:1;background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;">
      <div style="font-size:32px;font-weight:700;">${healthBadge}</div>
      <div style="font-size:13px;color:#555;">Health Score Change</div>
    </div>
  </div>

  <h3 style="font-size:15px;margin-top:24px;">Fixed this month:</h3>
  <ul style="padding-left:8px;list-style:none;line-height:1.8;">
    ${fixedItemsHtml}
    ${fixedFindings.length > 10 ? `<li style="color:#555;">...and ${fixedFindings.length - 10} more</li>` : ''}
  </ul>

  ${newIssuesNote}

  <div style="margin:28px 0;">
    <a href="${dashboardUrl}"
       style="background:#8B5CF6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
      View Full Dashboard →
    </a>
  </div>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">${brandName} · Monthly Report · Powered by ProposalOS</p>
</body>
</html>`;

    await resend.emails.send({
        from: `${brandName} <${fromEmail}>`,
        to: clientEmail,
        subject: `🏆 We fixed ${fixedCount} issue${fixedCount > 1 ? 's' : ''} for you this month`,
        html,
    });

    logger.info({ currentAuditId, clientEmail, fixedCount }, 'Win report email sent');

    return { fixedCount, healthImprovement, emailSent: true };
}
