import { generateWithGemini } from '@/lib/llm/provider';
import { prisma } from '@/lib/prisma';
import { generatePersonalizationDirectives, ProspectMetadata } from './personalization';

export interface EmailSequenceResult {
  emails: Array<{
    step: number;
    subjectA: string;
    subjectB: string;
    body: string;
    status: 'draft' | 'sent'
  }>;
}

/**
 * Parses the delimiter-based email output format from Gemini:
 *   ---EMAIL 1---
 *   SUBJECT_A: ...
 *   SUBJECT_B: ...
 *   BODY:
 *   (multi-line body text)
 *   ---EMAIL 2---
 *   ...
 */
function parseDelimitedEmails(raw: string): EmailSequenceResult['emails'] {
  const emails: EmailSequenceResult['emails'] = [];

  // Match each ---EMAIL N--- section and capture everything until the next delimiter or end
  const sectionRegex = /---EMAIL\s*(\d+)---\s*([\s\S]*?)(?=---EMAIL\s*\d+---|$)/gi;
  const matches = [...raw.matchAll(sectionRegex)];

  for (const match of matches.slice(0, 5)) {
    const block = match[2].trim();
    const subjectA = block.match(/^SUBJECT_A:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const subjectB = block.match(/^SUBJECT_B:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const bodyMatch = block.match(/^BODY:\s*\n([\s\S]+)$/m);
    const body = bodyMatch?.[1]?.trim() ?? block;
    const step = parseInt(match[1], 10);
    emails.push({ step, subjectA, subjectB, body, status: 'draft' });
  }

  // Fallback: if Gemini dropped the delimiter entirely, treat the whole text as email 1
  if (emails.length === 0 && raw.length > 50) {
    emails.push({ step: 1, subjectA: 'Your Audit Results', subjectB: 'Re: Your Business Audit', body: raw.trim(), status: 'draft' });
  }

  return emails;
}

export async function generateEmailSequenceNode(
  proposalId: string,
  auditContext: string,
  executiveSummary: string,
  roiData: string,
  meta: ProspectMetadata
): Promise<EmailSequenceResult> {

  const directives = generatePersonalizationDirectives(meta);

  const systemPrompt = `You are an elite B2B Strategic Copywriter. Write a highly converting 5-email follow-up sequence based on a recent audit.

${directives}

Audit Context:
${auditContext}

Executive Summary:
${executiveSummary}

ROI Data:
${roiData}

Output EXACTLY this format for each of the 5 emails. Do NOT output JSON. Use these exact delimiters:

---EMAIL 1---
SUBJECT_A: (subject line variant A)
SUBJECT_B: (subject line variant B for A/B test)
BODY:
(full email body here — plain text, multiple paragraphs, no JSON)

---EMAIL 2---
SUBJECT_A: ...
SUBJECT_B: ...
BODY:
...

(continue for emails 3, 4, 5)

Email Strategy:
- Email 1 (Immediate Hook): Top 3 findings with dollar impact.
- Email 2 (Deep Dive, Day 2): #1 pain + competitor comparison.
- Email 3 (Social Proof, Day 5): Similar client success story.
- Email 4 (ROI, Day 8): Personalized ROI model from proposal.
- Email 5 (Urgency, Day 12): Time-limited proposal validity offer.

Write like a sharp senior strategist — not like a generic AI mailer.`;

  const response = await generateWithGemini({
    model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.5-flash',
    input: systemPrompt,
    temperature: 0.7,
    maxOutputTokens: 4096,
  });

  const emailsData = parseDelimitedEmails(response.text);

  // Upsert into DB against the Prisma EmailSequence model
  await prisma.emailSequence.upsert({
    where: { proposalId },
    update: {
      industry: meta.industry,
      role: meta.role,
      sizeScope: meta.sizeScope,
      emails: emailsData as any,
    },
    create: {
      proposalId,
      industry: meta.industry,
      role: meta.role,
      sizeScope: meta.sizeScope,
      emails: emailsData as any,
      analytics: { openRates: {}, clickRates: {}, replyRates: {} }
    }
  });

  return { emails: emailsData };
}
