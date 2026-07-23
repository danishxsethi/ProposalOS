import { generateWithGemini } from '@/lib/llm/provider';
import { MODEL_CONFIG } from '@/lib/config/models';
import { logger } from '@/lib/logger';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface UpsellProposal {
    subject: string;
    body: string;
    proposedInvestment: number;
    newPainkillers: number;
}

export async function generateUpsellProposal(
    businessName: string,
    newFindings: { title: string; description?: string; type?: string }[],
    industry: string = 'general'
): Promise<UpsellProposal | null> {
    const painkillers = newFindings.filter(f => f.type === 'PAINKILLER');

    if (painkillers.length === 0) {
        return null;
    }

    // Rough pricing estimate based on number of critical new issues
    const proposedInvestment = painkillers.length * 497;

    const systemPrompt = `You are a strategic account manager for a digital growth agency.
Your client, ${businessName} (Industry: ${industry}), just received a monthly re-audit.

While we successfully fixed their previous issues, the audit discovered ${painkillers.length} NEW critical issues (Painkillers) that are currently hurting their digital performance and are outside the scope of their original package.

Here are the new critical issues:
${painkillers.map(f => `- ${f.title}: ${f.description}`).join('\n')}

Write a concise, professional, and consultative email to the client.
Acknowledge the progress made so far, gently introduce these new findings, and propose an add-on package to resolve them.
The proposed investment for fixing these is $${proposedInvestment}.
Do not sound alarmist. Focus on remaining competitive and protecting their growth.

Return JSON EXACTLY matching this schema:
{
  "subject": "Email subject line",
  "body": "The complete email body text"
}`;

    try {
        const result = await generateWithGemini({
            model: MODEL_CONFIG.proposal.model,
            input: systemPrompt,
            responseModality: 'json',
            temperature: 0.3,
            metadata: { node: 'upsell_generator', businessName }
        });

        let text = result.text.trim();
        if (text.startsWith('```json')) text = text.replace(/```json\n?/, '').replace(/\n?```$/, '');
        else if (text.startsWith('```')) text = text.replace(/```\n?/, '').replace(/\n?```$/, '');

        const parsed = JSON.parse(text);

        return {
            subject: parsed.subject,
            body: parsed.body,
            proposedInvestment,
            newPainkillers: painkillers.length
        };
    } catch (e) {
        logger.error({ error: e, businessName }, '[UpsellGenerator] Failed to generate upsell proposal');
        return null;
    }
}

export async function sendUpsellEmail(
    proposal: UpsellProposal,
    clientEmail: string,
    tenantId: string
): Promise<boolean> {
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

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #8B5CF6;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:22px;color:#8B5CF6;">${brandName}</h1>
  </div>
  <div style="line-height:1.6;font-size:15px;color:#333;white-space:pre-wrap;">
${proposal.body}
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">${brandName} · Powered by ProposalOS</p>
</body>
</html>`;

    try {
        await resend.emails.send({
            from: `${brandName} <${fromEmail}>`,
            to: clientEmail,
            subject: proposal.subject,
            html,
        });
        logger.info({ clientEmail }, 'Upsell proposal email sent successfully');
        return true;
    } catch (e) {
        logger.error({ error: e, clientEmail }, 'Failed to send upsell proposal email');
        return false;
    }
}
