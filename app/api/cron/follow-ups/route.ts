
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

function getResend() {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    return new Resend(key);
}

export async function GET(req: Request) {
    // Basic security for Cron (e.g. check for a secret header if needed)
    // For now, open or check for APP_SECRET if provided in headers.
    const authHeader = req.headers.get('Authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();

        // 1. Fetch pending follow-ups due now or in past
        const dueFollowUps = await prisma.proposalFollowUp.findMany({
            where: {
                status: 'pending',
                scheduledAt: { lte: now }
            },
            include: {
                proposal: {
                    include: { audit: true }
                }
            },
            take: 50 // Batch size to prevent timeouts
        });

        const results = [];

        for (const item of dueFollowUps) {
            try {
                // Determine recipient
                // If type == 'email', send to Prospect (Need prospect email! We don't have it on Proposal yet explicitly?)
                // Actually, where do we store prospect email? 
                // Audit? No. Proposal? 
                // We might rely on the Operator manually adding it, or we assume Tenant User for 'reminder'.

                // ISSUE: We don't have a defined 'prospectEmail' field in Audit or Proposal models yet.
                // Assuming for this task: The User wants to automate this, but we lack data.
                // Workaround: Send to the TENANT USER (Operator) as a test or "Draft to Send".
                // OR: Maybe the user expects us to assume we have it.
                // Re-reading user request: "Show list of team members... Invite Member..." - irrelevant.
                // "Send email via Resend".
                // Let's assume we send to a placeholder OR the Tenant's email for testing if prospect email missing.
                // But wait, "Reminder to operator" -> Sends to Tenant User.
                // "Follow-up 1" -> Sends to Prospect.

                // Let's check `TenantBranding` or `User` to send FROM.
                // We need to fetch the Tenant User (Owner) to know who to send TO for reminders.
                // For Prospect emails, we fundamentally need a `prospectEmail` on the Audit/Proposal.

                // ACTION: I will migrate schema to add `prospectEmail` to Proposal if missing.
                // Checking schema... Proposal doesn't have it. User doesn't have it.
                // I'll skip adding schema for now to avoid complexity creep, and instead:
                // Send ALL emails to the Tenant Owner (or logged in user context? No, cron has no user).
                // I will add a `prospectEmail` field to `Proposal` just to be comprehensive, 
                // OR I will simply mark them as 'sent' but verify we can't actually send without email.

                // Decision: For this specific task, I'll log "Would send to prospect" if email missing, 
                // but implementation requires `prospectEmail`.
                // I will add `prospectEmail` to Proposal model to make this real.

                // For `reminder` type: Send to the Tenant's contact email or first user.

                // Let's Fetch Tenant to get sender info.
                const tenant = await prisma.tenant.findUnique({
                    where: { id: item.tenantId },
                    include: { brandingConfig: true, users: { take: 1 } }
                });

                if (!tenant) continue;

                const senderName = tenant.brandingConfig?.brandName || item.proposal.audit.businessName;
                const senderEmail = 'onboarding@resend.dev'; // Default sandbox

                let toEmail = '';

                if (item.type === 'reminder') {
                    // Send to Operator (first user or contact email)
                    toEmail = tenant.brandingConfig?.contactEmail || tenant.users[0]?.email || '';
                } else {
                    // Send to Prospect
                    // We need to check if Proposal has email. 
                    // I will add `prospectEmail` string to Proposal to make this work.
                    // Accessing via `(item.proposal as any).prospectEmail` for now until I run migration.
                    toEmail = (item.proposal as any).prospectEmail;
                }

                if (toEmail) {
                    const resend = getResend();
                    if (resend) {
                        await resend.emails.send({
                            from: `${senderName} <${senderEmail}>`,
                            to: toEmail,
                            subject: item.emailSubject,
                            text: item.emailBody, // Plain text for now
                        });
                    }
                    await prisma.proposalFollowUp.update({
                        where: { id: item.id },
                        data: resend ? { status: 'sent', sentAt: new Date() } : { status: 'failed_no_resend' }
                    });
                    results.push({ id: item.id, status: resend ? 'sent' : 'skipped', to: toEmail });
                } else {
                    // Missing email, maybe mark as failed or skip
                    await prisma.proposalFollowUp.update({
                        where: { id: item.id },
                        data: { status: 'failed_no_email' }
                    });
                    results.push({ id: item.id, status: 'failed', reason: 'no email' });
                }

            } catch (err) {
                console.error(`Failed to process follow-up ${item.id}`, err);
                await prisma.proposalFollowUp.update({
                    where: { id: item.id },
                    data: { status: 'failed' } // retry logic?
                });
            }
        }

        return NextResponse.json({ success: true, processed: results.length, results });

    } catch (error) {
        console.error('Cron Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
