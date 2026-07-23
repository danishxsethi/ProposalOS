import { OutreachEmailType } from '@prisma/client';
import { topPainSentence } from './verticalPainLanguage';
import { PainBreakdownShape, toObject, toStringArray } from './scorecard';

type PainKey =
    | 'websiteSpeed'
    | 'mobileBroken'
    | 'gbpNeglected'
    | 'noSsl'
    | 'zeroReviewResponses'
    | 'socialDead'
    | 'competitorsOutperforming'
    | 'accessibilityViolations';

interface CompetitorEvidence {
    competitorSignals?: {
        competitorNames?: string[];
        reasons?: string[];
    };
}

export interface ComposeSniperEmailInput {
    businessName: string;
    city: string;
    vertical: string;
    painScore: number | null;
    topFindings: unknown;
    painBreakdown: unknown;
    qualificationEvidence: unknown;
    scorecardUrl: string;
    proposalUrl?: string | null;
    type: OutreachEmailType;
    attempt?: number;
}

export interface ComposedSniperEmail {
    subject: string;
    body: string;
    requiredFindingSnippets: string[];
    findingsUsed: string[];
}

const PAIN_KEYS: PainKey[] = [
    'websiteSpeed',
    'mobileBroken',
    'gbpNeglected',
    'noSsl',
    'zeroReviewResponses',
    'socialDead',
    'competitorsOutperforming',
    'accessibilityViolations',
];

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizeSentence(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/^\W+|\W+$/g, '').trim();
}

function shortenFinding(text: string, maxWords = 11): string {
    const clean = sanitizeSentence(text);
    if (!clean) return '';
    const words = clean.split(/\s+/);
    if (words.length <= maxWords) return clean.endsWith('.') ? clean : `${clean}.`;
    return `${words.slice(0, maxWords).join(' ')}.`;
}

function hasMetric(text: string): boolean {
    return /\b\d+(?:\.\d+)?(?:\s*(?:%|s|sec|seconds|ms|reviews?|rating|score|points?))?\b/i.test(text);
}

function pullFindings(input: ComposeSniperEmailInput): string[] {
    const findings = toStringArray(input.topFindings).map((finding) => shortenFinding(finding));
    const breakdown = toObject<Record<string, unknown>>(input.painBreakdown, {}) as PainBreakdownShape;

    for (const key of PAIN_KEYS) {
        const detail = sanitizeSentence(breakdown[key]?.detail || '');
        if (detail) findings.push(shortenFinding(detail));
    }

    if ((input.painScore ?? 0) > 0) {
        findings.push(`Pain Score ${input.painScore}/100.`);
    }

    const deduped: string[] = [];
    for (const finding of findings) {
        if (!finding) continue;
        const normalized = finding.toLowerCase();
        if (deduped.some((existing) => existing.toLowerCase() === normalized)) continue;
        deduped.push(finding);
    }

    const quantified = deduped.filter((finding) => hasMetric(finding));
    if (quantified.length >= 2) return quantified.slice(0, 3);
    return deduped.slice(0, 3);
}

function pullTopPainKeys(painBreakdown: unknown): PainKey[] {
    const breakdown = toObject<Record<string, unknown>>(painBreakdown, {}) as PainBreakdownShape;
    return PAIN_KEYS
        .map((key) => ({
            key,
            score: typeof breakdown[key]?.score === 'number' ? breakdown[key]?.score as number : 0,
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => row.key);
}

function pullCompetitor(qualificationEvidence: unknown): { name: string | null; reason: string | null } {
    const evidence = toObject<Record<string, unknown>>(qualificationEvidence, {}) as CompetitorEvidence;
    const names = Array.isArray(evidence.competitorSignals?.competitorNames)
        ? evidence.competitorSignals?.competitorNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    const reasons = Array.isArray(evidence.competitorSignals?.reasons)
        ? evidence.competitorSignals?.reasons.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    return {
        name: names[0] ?? null,
        reason: reasons[0] ?? null,
    };
}

function clipBusinessName(name: string): string {
    if (name.length <= 28) return name;
    return `${name.slice(0, 28).trimEnd()}…`;
}

function subjectForType(type: OutreachEmailType, businessName: string, competitorName: string | null): string {
    const clipped = clipBusinessName(businessName);
    switch (type) {
        case OutreachEmailType.FOLLOWUP_COMPETITOR:
            return competitorName ? `${competitorName} is pulling ahead` : `${clipped} local gap`;
        case OutreachEmailType.FOLLOWUP_PROPOSAL:
            return `Full plan for ${clipped}`;
        case OutreachEmailType.FOLLOWUP_GBP:
            return `${clipped} map-pack gap`;
        case OutreachEmailType.FOLLOWUP_RETRY:
            return `Quick note for ${clipped}`;
        case OutreachEmailType.INITIAL:
        default:
            return `${clipped}: 3 quick fixes`;
    }
}

function compactBody(text: string, limit = 80): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (wordCount(normalized) <= limit) return normalized;

    const sentences = normalized.split(/(?<=[.!?])\s+/);
    while (sentences.length > 1 && wordCount(sentences.join(' ')) > limit) {
        sentences.splice(sentences.length - 2, 1);
    }
    const compact = sentences.join(' ').trim();
    if (wordCount(compact) <= limit) return compact;
    return compact.split(/\s+/).slice(0, limit).join(' ');
}

import { generateWithGemini } from '@/lib/llm/provider';
import { logger } from '@/lib/logger';

export async function composeSniperEmail(input: ComposeSniperEmailInput): Promise<ComposedSniperEmail> {
    const attempt = Math.max(1, Math.min(3, input.attempt ?? 1));
    const findings = pullFindings(input);
    const finding1 = findings[0] || `Pain Score ${input.painScore ?? 60}/100.`;
    const finding2 = findings[1] || `Local search gap is still visible.`;

    const painKeys = pullTopPainKeys(input.painBreakdown);
    const painPhrase = topPainSentence(input.vertical, painKeys);
    const competitor = pullCompetitor(input.qualificationEvidence);

    const scorecardLine = `Scorecard: ${input.scorecardUrl}`;
    const proposalLine = input.proposalUrl ? `Full proposal: ${input.proposalUrl}` : '';

    const prompt = `You are an expert SDR writing a highly personalized cold email to the owner of ${input.businessName}, a ${input.vertical} business in ${input.city}.
    
Context:
- Email Type: ${input.type} (Attempt ${attempt}/3)
- Key Finding 1: ${finding1}
- Key Finding 2: ${finding2}
- Their Pain: ${painPhrase}
- Competitor mentioned: ${competitor.name || 'Local competitors'}
- Links to include: ${scorecardLine} ${proposalLine ? 'and ' + proposalLine : ''}

Preemptive Objection Handling:
Based on the ${input.vertical} industry, subtly address their most likely objection (e.g., "I don't have time", "Word of mouth is enough").

Deliverability Rules (CRITICAL):
- DO NOT use spam flags (e.g., "Free", "100%", "Guarantee", "Buy", "Click here").
- Keep it under 80 words.
- Tone should be professional, direct, and helpful (not salesy).

Output strict JSON matching this schema exactly:
{
  "subject": "The email subject line (short, lowercase preferred)",
  "body": "The email body. Do not include signature blocks."
}
`;

    try {
        const result = await generateWithGemini({
            model: 'gemini-1.5-flash-latest',
            input: prompt,
            responseModality: 'json',
            temperature: 0.4,
            tenantId: 'system',
            metadata: { node: 'email_composer' }
        });

        const parsed = JSON.parse(result.text);

        // Basic spam scrubbing fallback
        const scrubbedBody = parsed.body.replace(/\b(free|guarantee|100%|buy now|click here)\b/gi, '***');

        return {
            subject: parsed.subject || subjectForType(input.type, input.businessName, competitor.name),
            body: scrubbedBody || compactBody(`${finding1} ${finding2}`, 80),
            requiredFindingSnippets: [finding1, finding2].map((item) => sanitizeSentence(item)).filter(Boolean),
            findingsUsed: findings.slice(0, 3),
        };
    } catch (err: any) {
        logger.error({ err: err.message, businessName: input.businessName }, 'Failed to generate email with LLM, falling back to template.');

        // Fallback to static template
        const baseSubject = subjectForType(input.type, input.businessName, competitor.name);
        const baseBody = compactBody(`${finding1} ${finding2} ${painPhrase}. ${scorecardLine} ${proposalLine}`, 80);
        return {
            subject: baseSubject,
            body: baseBody,
            requiredFindingSnippets: [finding1, finding2].map((item) => sanitizeSentence(item)).filter(Boolean),
            findingsUsed: findings.slice(0, 3),
        };
    }
}
