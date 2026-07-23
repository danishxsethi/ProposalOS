/**
 * FIX-05: Delivery handover email.
 * After the delivery engine bundles all fixes, upload to GCS and email the client.
 */

import { Storage } from '@google-cloud/storage';
import { Resend } from 'resend';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_DELIVERY_BUCKET ?? 'proposal-os-deliveries';
const SIGNED_URL_TTL_HOURS = 168; // 7 days

export interface DeliveryHandoverOptions {
    proposalId: string;
    clientEmail: string;
    clientName?: string;
    bundleBuffer: Buffer;
    bundleFilename: string;
    deliveredItems: string[];
    dashboardUrl: string;
    brandName?: string;
    fromEmail?: string;
}

/**
 * Uploads the delivery ZIP to GCS and sends a handover email with a signed URL.
 */
export async function sendDeliveryHandoverEmail(opts: DeliveryHandoverOptions): Promise<{ signedUrl: string }> {
    const {
        proposalId,
        clientEmail,
        clientName,
        bundleBuffer,
        bundleFilename,
        deliveredItems,
        dashboardUrl,
        brandName = 'ProposalOS',
        fromEmail = process.env.DEFAULT_FROM_EMAIL ?? 'noreply@proposalos.com',
    } = opts;

    // ── Step 1: Upload bundle to GCS ──
    const gcsPath = `deliveries/${proposalId}/${bundleFilename}`;
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(gcsPath);

    await file.save(bundleBuffer, {
        metadata: {
            contentType: 'application/zip',
            cacheControl: 'private, no-cache',
        },
    });

    // ── Step 2: Generate a time-limited signed URL ──
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SIGNED_URL_TTL_HOURS);

    const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
    });

    logger.info({ proposalId, gcsPath, signedUrl: signedUrl.substring(0, 80) }, 'Delivery bundle uploaded to GCS');

    // ── Step 3: Build the email HTML ──
    const greeting = clientName ? `Hi ${clientName},` : 'Hi there,';
    const expiryDateStr = expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const itemsHtml = deliveredItems
        .map(item => `<li style="margin-bottom:6px;">✅ ${item}</li>`)
        .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #8B5CF6;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:22px;color:#8B5CF6;">${brandName}</h1>
  </div>

  <p>${greeting}</p>
  <p style="font-size:16px;">🎁 <strong>Your delivery bundle is ready!</strong> All fixes have been completed and packaged for you.</p>

  <h3>What's included:</h3>
  <ul style="padding-left:16px;line-height:1.8;">
    ${itemsHtml}
  </ul>

  <div style="margin:28px 0;">
    <a href="${signedUrl}"
       style="background:#8B5CF6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
      ⬇️ Download Your Delivery Bundle
    </a>
  </div>

  <p style="font-size:13px;color:#666;">⚠️ This download link expires on <strong>${expiryDateStr}</strong>.</p>

  <p>You can also track the status of all your fixes in your client dashboard:</p>
  <a href="${dashboardUrl}" style="color:#8B5CF6;">View Live Fix Tracker →</a>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">${brandName} · Powered by ProposalOS</p>
</body>
</html>`;

    await resend.emails.send({
        from: `${brandName} <${fromEmail}>`,
        to: clientEmail,
        subject: `🎁 Your delivery is ready — ${bundleFilename}`,
        html,
    });

    logger.info({ proposalId, clientEmail }, 'Delivery handover email sent');

    return { signedUrl };
}
