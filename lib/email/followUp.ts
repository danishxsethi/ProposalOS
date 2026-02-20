/**
 * Follow-up email generator — 3-email sequence after in-person meeting.
 * For Saskatoon door-to-door: business owner gave consent, CASL compliant.
 */
import { generateWithGemini } from '@/lib/llm/provider';
import { MODEL_CONFIG } from '@/lib/config/models';
import type {
  AuditForEmail,
  ProposalForEmail,
  PlaybookForEmail,
  FollowUpSequence,
} from './types';
import type { CostTracker } from '@/lib/costs/costTracker';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://proposalengine.com';

export interface FollowUpInput {
  audit: AuditForEmail;
  proposal: ProposalForEmail;
  playbook: PlaybookForEmail | null;
  /** Finding discussed in person (so we don't repeat it in Email 2) */
  discussedFindingIds?: string[];
  /** Tier they seemed interested in */
  interestedTier?: 'starter' | 'growth' | 'premium';
  /** Optional: where you met (e.g. "your office", "the shop") */
  meetingContext?: string;
}

function buildFollowUpContext(input: FollowUpInput): string {
  const { audit, proposal, playbook } = input;

  const findingsText = audit.findings
    .slice(0, 12)
    .map(
      (f) =>
        `- [${f.type}] ${f.title}: ${f.description || ''} Metrics: ${JSON.stringify(f.metrics)}`
    )
    .join('\n');

  const discussedIds = new Set(input.discussedFindingIds ?? []);
  const notDiscussed = audit.findings.filter((f) => !discussedIds.has(f.id));

  const pricing = proposal.pricing as Record<string, number> | null;
  const tierPrices = {
    starter: pricing?.starter ?? pricing?.essentials ?? 497,
    growth: pricing?.growth ?? 1497,
    premium: pricing?.premium ?? 2997,
  };

  const industryContext = playbook?.proposalLanguage
    ? `Industry: ${playbook.name}. Pain points: ${playbook.proposalLanguage.painPoints?.slice(0, 2).join('; ') || 'N/A'}`
    : '';

  const proposalUrl = `${BASE_URL}/proposal/${proposal.webLinkToken}`;

  return `
BUSINESS: ${audit.businessName}
MEETING CONTEXT: ${input.meetingContext || 'in-person meeting'}
${industryContext}

FINDINGS (discussed in person — do NOT repeat in Email 2):
${audit.findings.filter((f) => discussedIds.has(f.id)).map((f) => `- ${f.title}`).join('\n') || 'None specified'}

FINDINGS NOT YET DISCUSSED (use one in Email 2 for new value):
${notDiscussed.slice(0, 5).map((f) => `- ${f.title}: ${f.description || ''}`).join('\n')}

PRICING: Starter $${tierPrices.starter}, Growth $${tierPrices.growth}, Premium $${tierPrices.premium}
INTERESTED TIER: ${input.interestedTier || 'growth'}
PROPOSAL LINK: ${proposalUrl}

RULES:
- Email 1: Same day. "Great meeting you today at [business]". Attach/link full audit. Recap top finding discussed.
- Email 2: Day 3. Quick check-in. Reference a finding you DIDN'T discuss (new value). Soft CTA: "Any questions about the report?"
- Email 3: Day 7. Mention the pricing tier they seemed interested in. Add urgency: "I have capacity for 3 more projects this month". CTA: "Ready to get started? Just reply and I'll send the invoice."
- All emails: Under 120 words, conversational, no spam words.
`;
}

export async function generateFollowUpSequence(
  input: FollowUpInput,
  tracker?: CostTracker
): Promise<FollowUpSequence> {
  const context = buildFollowUpContext(input);
  const proposalUrl = `${BASE_URL}/proposal/${input.proposal.webLinkToken}`;

  const prompt = `You are writing follow-up emails after an in-person meeting. The business owner gave consent — these are warm leads.

${context}

Generate exactly 3 emails. Return valid JSON only:

{
  "emails": [
    {
      "dayOffset": 0,
      "subject": "string (e.g. 'Great meeting you today at [Business Name]')",
      "body": "string (same-day thank you, link to audit, recap top finding discussed, CTA: 'Here\\'s the audit we talked about → [link]')",
      "previewText": "string (first 50 chars)"
    },
    {
      "dayOffset": 3,
      "subject": "string (quick check-in)",
      "body": "string (reference a finding you DIDN'T discuss — new value, soft CTA: 'Any questions about the report?')",
      "previewText": "string"
    },
    {
      "dayOffset": 7,
      "subject": "string (mention pricing/next step)",
      "body": "string (mention tier they seemed interested in, urgency: 'I have capacity for 3 more projects this month', CTA: 'Ready to get started? Just reply and I\\'ll send the invoice.')",
      "previewText": "string"
    }
  ]
}

Replace [link] with: ${proposalUrl}
Return ONLY the JSON object.`;

  const result = await generateWithGemini({
    model: MODEL_CONFIG.flash.model,
    input: prompt,
    temperature: 0.5,
    maxOutputTokens: 2048,
    metadata: { node: 'follow_up_generator' }
  });
  const text = result.text || '';

  if (tracker && result.usageMetadata) {
    const usage = result.usageMetadata;
    tracker.addLlmCall('GEMINI_FLASH', usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0, usage.thoughtsTokenCount ?? 0);
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as { emails: FollowUpSequence['emails'] };

  return {
    emails: parsed.emails.map((e) => ({
      ...e,
      body: (e.body || '').replace(/\[link\]/g, proposalUrl),
    })),
    metadata: {
      businessName: input.audit.businessName,
      meetingContext: input.meetingContext,
      generatedAt: new Date().toISOString(),
    },
  };
}
