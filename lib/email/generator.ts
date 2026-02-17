/**
 * Email sequence generator — 4-email cold outreach sequence.
 * Uses Gemini to generate personalized emails from audit + proposal + playbook.
 */
import { getGeminiModel } from '@/lib/llm/gemini';
import type {
  AuditForEmail,
  ProposalForEmail,
  PlaybookForEmail,
  EmailSequence,
} from './types';
import type { CostTracker } from '@/lib/costs/costTracker';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://proposalengine.com';

function buildContext(audit: AuditForEmail, proposal: ProposalForEmail, playbook: PlaybookForEmail | null): string {
  const findingsText = audit.findings
    .slice(0, 15)
    .map(
      (f) =>
        `- [${f.type}] ${f.title} (${f.category}): ${f.description || ''} Metrics: ${JSON.stringify(f.metrics)}`
    )
    .join('\n');

  const pricing = proposal.pricing as Record<string, number> | null;
  const pricingText = pricing
    ? `Starter $${pricing.starter ?? pricing.essentials ?? 497}, Growth $${pricing.growth ?? 1497}, Premium $${pricing.premium ?? 2997}`
    : 'Starter $497, Growth $1,497, Premium $2,997';

  let competitorText = '';
  const cr = proposal.comparisonReport;
  if (cr) {
    competitorText = `
Competitor data:
- Rank: #${cr.prospectRank}
- Summary: ${cr.summaryStatement}
- Winning: ${cr.winningCategories?.join(', ') || 'none'}
- Losing: ${cr.losingCategories?.join(', ') || 'none'}
- Urgency: ${cr.urgencyStatement}
${cr.biggestGap ? `- Biggest gap: ${cr.biggestGap.category} — ${cr.biggestGap.competitorName} scores ${cr.biggestGap.bestCompetitorScore} vs prospect ${cr.biggestGap.prospectScore}` : ''}
`;
  }

  const industryContext = playbook?.proposalLanguage
    ? `Industry: ${playbook.name}. Pain points: ${playbook.proposalLanguage.painPoints?.slice(0, 3).join('; ') || 'N/A'}. Urgency: ${playbook.proposalLanguage.urgencyHook || 'N/A'}`
    : '';

  const proposalUrl = `${BASE_URL}/proposal/${proposal.webLinkToken}`;

  return `
BUSINESS: ${audit.businessName}
CITY: ${audit.businessCity || 'N/A'}
INDUSTRY: ${audit.businessIndustry || playbook?.id || 'general'}
${industryContext}

FINDINGS (use real data — numbers, metrics):
${findingsText}

PRICING: ${pricingText}
PROPOSAL LINK: ${proposalUrl}
${competitorText}

QUALITY RULES (MUST follow):
- Each email MUST reference at least one real finding with real data (numbers, scores, metrics)
- Each email MUST be under 150 words
- No spam words: avoid "free", "guaranteed", "act now", "limited time"
- Subject line MUST be under 60 characters
- Include business name in body
- Include clear CTA
- Add at end: "To unsubscribe, reply STOP. Our address: [Your Business Address]"
- Tone: helpful, consultative — NOT salesy or aggressive
`;
}

export async function generateEmailSequence(
  audit: AuditForEmail,
  proposal: ProposalForEmail,
  playbook: PlaybookForEmail | null,
  tracker?: CostTracker
): Promise<EmailSequence> {
  const model = getGeminiModel('gemini-2.5-flash', {
    temperature: 0.5,
    maxOutputTokens: 4096,
  });

  const context = buildContext(audit, proposal, playbook);
  const proposalUrl = `${BASE_URL}/proposal/${proposal.webLinkToken}`;

  const prompt = `You are an expert B2B email copywriter. Generate a 4-email cold outreach sequence for a business that received a website audit.

${context}

Generate exactly 4 emails. Return valid JSON only, no markdown or explanation:

{
  "emails": [
    {
      "dayOffset": 0,
      "subject": "string (≤60 chars, use ONE specific finding as hook — e.g. 'Your website takes 6.8 seconds to load — here\\'s what that costs you')",
      "body": "string (5-7 lines, reference one real finding with real data, offer full report, include CTA 'Want me to send the full report?', include unsubscribe line)",
      "previewText": "string (first 50 chars of body for email preview)",
      "personalizationScore": number (1-10, how well it references real audit data)
    },
    {
      "dayOffset": 3,
      "subject": "string (different finding from different category)",
      "body": "string (share second finding, add competitor comparison data point, include benchmark, CTA: 'Here\\'s the full report if you want it → [link]')",
      "previewText": "string",
      "personalizationScore": number
    },
    {
      "dayOffset": 7,
      "subject": "Quick roadmap for [website/their business]",
      "body": "string (top 3 recommendations as bullets, estimated impact, mention full proposal, CTA: 'Want the full proposal? Takes 2 min to review → [link]')",
      "previewText": "string",
      "personalizationScore": number
    },
    {
      "dayOffset": 14,
      "subject": "Closing the loop on [website/their business]",
      "body": "string (gracious, no pressure, one-line summary, leave door open, CTA: 'Just reply \\'send it\\' and I\\'ll forward everything')",
      "previewText": "string",
      "personalizationScore": number
    }
  ]
}

Replace [link] in bodies with: ${proposalUrl}

Return ONLY the JSON object.`;

  const result = await model.generateContent(prompt);
  const text =
    (result.response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]
      ?.content?.parts?.[0]?.text ?? '';

  if (tracker && (result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata) {
    const usage = (result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
    tracker.addLlmCall('GEMINI_FLASH', usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0);
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  let parsed: { emails: EmailSequence['emails'] };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Email generator returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const topFinding = audit.findings
    .filter((f) => f.type === 'PAINKILLER')
    .sort((a, b) => b.impactScore - a.impactScore)[0]?.title ?? audit.findings[0]?.title ?? 'Website issues';

  return {
    emails: parsed.emails.map((e) => ({
      ...e,
      body: (e.body || '').replace(/\[link\]/g, proposalUrl),
    })),
    metadata: {
      businessName: audit.businessName,
      vertical: audit.verticalPlaybookId || audit.businessIndustry || 'general',
      topFinding,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Regenerate specific emails with quality feedback.
 * Call when checkEmailSequenceQuality returns failedEmails.
 */
export async function regenerateEmailsWithFeedback(
  audit: AuditForEmail,
  proposal: ProposalForEmail,
  playbook: PlaybookForEmail | null,
  sequence: EmailSequence,
  failedIndices: number[],
  qualityReports: import('./qualityCheck').QualityReport[],
  tracker?: CostTracker
): Promise<EmailSequence> {
  const model = getGeminiModel('gemini-2.5-flash', {
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  const proposalUrl = `${BASE_URL}/proposal/${proposal.webLinkToken}`;
  const context = buildContext(audit, proposal, playbook);

  const feedbackByIndex = failedIndices
    .map((i) => `Email ${i + 1} (day ${sequence.emails[i].dayOffset}): ${qualityReports[i].issues.join('; ')}`)
    .join('\n');

  const emailsToRegenerate = failedIndices.map((i) => sequence.emails[i]);
  const emailSpecs = emailsToRegenerate
    .map(
      (e, idx) =>
        `Day ${e.dayOffset}: subject="${e.subject}" — FIX: ${qualityReports[failedIndices[idx]].issues.join('; ')}`
    )
    .join('\n');

  const prompt = `You previously generated these emails but they FAILED quality checks. Regenerate ONLY the failed emails.

${context}

FAILED EMAILS TO FIX:
${emailSpecs}

QUALITY ISSUES:
${feedbackByIndex}

Return valid JSON with ONLY the failed emails (same structure as before):
{
  "emails": [
    { "dayOffset": number, "subject": "string", "body": "string", "previewText": "string", "personalizationScore": number }
  ]
}

Replace [link] with: ${proposalUrl}
Return ONLY the JSON object.`;

  const result = await model.generateContent(prompt);
  const text =
    (result.response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]
      ?.content?.parts?.[0]?.text ?? '';

  if (tracker && (result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata) {
    const usage = (result as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
    tracker.addLlmCall('GEMINI_FLASH', usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0);
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as { emails: EmailSequence['emails'] };

  const fixedEmails = parsed.emails.map((e) => ({
    ...e,
    body: (e.body || '').replace(/\[link\]/g, proposalUrl),
  }));

  const newEmails = [...sequence.emails];
  failedIndices.forEach((origIdx, i) => {
    newEmails[origIdx] = fixedEmails[i];
  });

  return {
    ...sequence,
    emails: newEmails,
    metadata: {
      ...sequence.metadata,
      generatedAt: new Date().toISOString(),
    },
  };
}
