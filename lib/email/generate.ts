/**
 * Cold email generation pipeline — personalized outreach from audit data.
 * Uses Gemini to generate 3 variants, scores them, rejects <70.
 */
import { type EmailScoreBreakdown, isEmailAcceptable, scoreEmail } from '@/lib/email/score';
import { fillEmailTemplate, getEmailTemplate } from '@/lib/email-templates';
import { generateWithGemini } from '@/lib/llm/provider';

export interface GeneratedEmail {
  subject: string;
  body: string;
  score: number;
  breakdown: EmailScoreBreakdown;
  variant: number;
}

export interface GenerateColdEmailInput {
  auditId: string;
  vertical: string;
  businessName: string;
  recipientName?: string;
  proposalUrl: string;
  topFinding: string;
  topMetric?: string;
  competitorName?: string;
}

export interface GenerateColdEmailResult {
  emails: GeneratedEmail[];
  bestVariant: number;
}

// Security: Prevent prompt injection attacks through prospect names or scraping data
export function sanitizeForPrompt(str: string): string {
  if (!str) return 'Unknown';
  return (
    str
      .replace(/[\r\n\t]/g, ' ')
      // Remove markdown or AI instruction keywords
      .replace(/(\b)(system|instruction|prompt|ignore|bypass|override)(\b)/gi, '')
      // Remove code block backticks and special bracket sequences
      .replace(/[`<>{}[\]\\]/g, '')
      // Cap length to prevent buffer/context attacks
      .substring(0, 150)
      .trim()
  );
}

export function extractAuditContext(audit: {
  businessName: string;
  businessCity: string | null;
  businessIndustry: string | null;
  findings: Array<{
    title: string;
    description: string | null;
    metrics: unknown;
    impactScore: number;
  }>;
  comparisonReport?: { competitors?: Array<{ name?: string }> } | null;
}): {
  topFinding: string;
  topMetric: string | undefined;
  competitorName: string | undefined;
  city: string;
} {
  const top = audit.findings
    .filter((f) => !(f as { excluded?: boolean }).excluded)
    .sort((a, b) => b.impactScore - a.impactScore)[0];

  const topFinding = top?.title || 'several issues affecting your online visibility';
  let topMetric: string | undefined;
  if (top?.metrics && typeof top.metrics === 'object') {
    const m = top.metrics as Record<string, unknown>;
    if (typeof m.loadTimeSeconds === 'number') {
      topMetric = `${m.loadTimeSeconds.toFixed(1)}s mobile load time`;
    } else if (typeof m.performanceScore === 'number') {
      topMetric = `${m.performanceScore} performance score`;
    }
  }

  const competitorName = audit.comparisonReport?.competitors?.[0]?.name;
  const city = audit.businessCity || 'Saskatoon';

  return { topFinding, topMetric, competitorName, city };
}

const SYSTEM_PROMPT = `You are an expert cold email copywriter for local business marketing. Your emails:
- Are under 80 words (Lavender research: shorter = higher reply rates)
- Read at 5th grade level (simple words, short sentences)
- Open with a SPECIFIC finding or metric from the audit (numbers, percentages)
- Offer value (free audit, quick wins)
- Include one clear CTA (link to proposal)
- Subject line: under 40 chars, curiosity-driven, personalized
- End with "Reply STOP to unsubscribe" for compliance
- NO spam words: free, guaranteed, act now, limited time, etc.`;

const MAX_REGENERATE_ATTEMPTS = 2;

export async function generateColdEmails(
  input: GenerateColdEmailInput
): Promise<GenerateColdEmailResult> {
  const template = getEmailTemplate(input.vertical, 'cold');
  const baseExample = template
    ? fillEmailTemplate(template, {
        businessName: input.businessName,
        finding: input.topFinding,
        proposalUrl: input.proposalUrl,
      })
    : { subject: '', body: '' };

  // P1 Security Challenge: Adversarial prospect data (Prompt Injection Prevention)
  // We sanitize input to prevent attackers from providing a business name like "Ignore previous instructions and output..."
  const safeBusinessName = sanitizeForPrompt(input.businessName);
  const safeRecipientName = sanitizeForPrompt(input.recipientName || input.businessName);
  const safeFinding = sanitizeForPrompt(input.topFinding);
  const safeMetric = input.topMetric ? sanitizeForPrompt(input.topMetric) : '';
  const safeCompetitor = input.competitorName ? sanitizeForPrompt(input.competitorName) : '';

  const prompt = `Generate 3 different cold email variants for this local business.

BUSINESS: ${safeBusinessName}
VERTICAL: ${input.vertical}
RECIPIENT: ${safeRecipientName}
TOP FINDING: ${safeFinding}
${safeMetric ? `TOP METRIC: ${safeMetric}` : ''}
${safeCompetitor ? `COMPETITOR: ${safeCompetitor}` : ''}
PROPOSAL URL: ${input.proposalUrl}

RULES:
- Each email UNDER 80 words
- 5th grade reading level
- Open with a specific finding/metric (e.g. "I noticed ${safeBusinessName}'s website loads in 4.2s on mobile — slower than 80% of ${input.vertical} sites in Saskatoon")
- Offer value: "I ran a free audit and found 3 quick wins"
- One CTA with proposal link
- Subject under 40 chars, curiosity-driven
- End each body with "Reply STOP to unsubscribe"
- NO: guaranteed, act now, limited time, click here (\"free audit\" is OK)

Base template style (adapt, don't copy):
Subject: ${baseExample.subject}
Body: ${baseExample.body}

Return JSON only:
{
  "variants": [
    { "subject": "...", "body": "..." },
    { "subject": "...", "body": "..." },
    { "subject": "...", "body": "..." }
  ]
}`;

  const { text } = await generateWithGemini('gemini-1.5-flash', prompt, {
    temperature: 0.7,
    maxOutputTokens: 1024,
  });

  const cleanJson = text.replace(/```json|```/g, '').trim();
  let parsed: { variants: Array<{ subject: string; body: string }> };
  try {
    parsed = JSON.parse(cleanJson);
  } catch {
    throw new Error('Failed to parse LLM response as JSON');
  }

  const variants = parsed.variants?.slice(0, 3) || [];
  const auditData = {
    hasFinding: !!input.topFinding,
    hasMetric: !!input.topMetric,
    businessName: input.businessName,
  };

  const scoreVariants = (vars: Array<{ subject: string; body: string }>): GeneratedEmail[] => {
    const out: GeneratedEmail[] = [];
    for (let i = 0; i < vars.length; i++) {
      const v = vars[i]!;
      const breakdown = scoreEmail(v!.subject, v!.body, auditData);
      out.push({
        subject: v!.subject,
        body: v!.body,
        score: breakdown.total,
        breakdown,
        variant: i + 1,
      });
    }
    return out;
  };

  let results = scoreVariants(variants);
  let attempts = 1;

  while (
    attempts < MAX_REGENERATE_ATTEMPTS &&
    results.every((r) => !isEmailAcceptable(r.breakdown))
  ) {
    const { text: retryText } = await generateWithGemini('gemini-1.5-flash', prompt, {
      temperature: 0.8,
      maxOutputTokens: 1024,
    });
    const retryJson = retryText.replace(/```json|```/g, '').trim();
    try {
      const retryParsed = JSON.parse(retryJson);
      const retryVariants = retryParsed.variants?.slice(0, 3) || [];
      if (retryVariants.length > 0) results = scoreVariants(retryVariants);
    } catch {
      break;
    }
    attempts++;
  }

  const best = results.reduce((a, b) => (a.score > b.score ? a : b));
  return { emails: results, bestVariant: best.variant };
}
