/**
 * Email quality scoring for cold outreach.
 * Scores 0-100 across 6 dimensions. Reject if <70.
 */

const TARGET_WORD_COUNT = 80;
const TARGET_GRADE_LEVEL = 5;
const MAX_SUBJECT_CHARS = 40;

const SPAM_TRIGGERS = [
    'guaranteed',
    'act now',
    'limited time',
    'click here',
    'buy now',
    'winner',
    'congratulations',
    'urgent',
    'cash',
    'money back',
    'no risk',
    '100% free',
    'guarantee',
    'amazing',
    'incredible',
    'miracle',
    'secret',
];

const CAN_SPAM_INDICATORS = [
    /\b(unsubscribe|opt.?out|opt.?in)\b/i,
    /\b(physical address|our address|mailing address)\b/i,
    /\d+\s+\w+\s+(st|street|ave|avenue|blvd|road|rd)/i,
];

export interface EmailScoreBreakdown {
    personalization: number;
    brevity: number;
    readability: number;
    canSpam: number;
    spamScore: number;
    subjectQuality: number;
    total: number;
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

/**
 * Flesch-Kincaid grade level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 * Target: ~5 for 5th grade readability.
 */
function fleschKincaidGradeLevel(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    const wordCount = words.length;
    const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

    if (wordCount === 0) return 0;
    const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllableCount / wordCount) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
}

function scorePersonalization(body: string, auditData: { hasFinding?: boolean; hasMetric?: boolean }): number {
    let score = 0;
    // References specific numbers (e.g. "4.2 seconds", "80%")
    if (/\d+\.?\d*\s*(s|sec|seconds|%|percent)/i.test(body)) score += 8;
    else if (/\d+/.test(body)) score += 5;

    // References business/vertical context
    if (/saskatoon|saskatchewan/i.test(body)) score += 6;
    if (auditData.hasFinding) score += 6;
    if (auditData.hasMetric) score += 5;

    return Math.min(25, score);
}

function scoreBrevity(wordCount: number): number {
    if (wordCount <= TARGET_WORD_COUNT) return 15;
    if (wordCount <= 100) return 12;
    if (wordCount <= 120) return 8;
    return Math.max(0, 15 - (wordCount - TARGET_WORD_COUNT) * 0.2);
}

function scoreReadability(gradeLevel: number): number {
    const diff = Math.abs(gradeLevel - TARGET_GRADE_LEVEL);
    if (diff <= 1) return 15;
    if (diff <= 2) return 12;
    if (diff <= 3) return 8;
    return Math.max(0, 15 - diff * 3);
}

function scoreCanSpam(body: string): number {
    const hasUnsubscribe = /unsubscribe|opt.?out/i.test(body);
    const hasAddress = CAN_SPAM_INDICATORS.some((r) => r.test(body));
    return (hasUnsubscribe ? 8 : 0) + (hasAddress ? 7 : 0);
}

function scoreSpamTriggers(body: string): number {
    const lower = body.toLowerCase();
    const matches = SPAM_TRIGGERS.filter((t) => lower.includes(t));
    return Math.max(0, 15 - matches.length * 5);
}

function scoreSubjectQuality(subject: string, businessName?: string): number {
    let score = 0;
    if (subject.length <= MAX_SUBJECT_CHARS) score += 8;
    else if (subject.length <= 50) score += 5;

    if (businessName && subject.toLowerCase().includes(businessName.toLowerCase())) score += 7;
    else if (/[?]|quick|note|question/i.test(subject)) score += 5;

    return Math.min(15, score);
}

export function scoreEmail(
    subject: string,
    body: string,
    auditData: { hasFinding?: boolean; hasMetric?: boolean; businessName?: string }
): EmailScoreBreakdown {
    const wordCount = countWords(body);
    const gradeLevel = fleschKincaidGradeLevel(body);

    const personalization = scorePersonalization(body, auditData);
    const brevity = scoreBrevity(wordCount);
    const readability = scoreReadability(gradeLevel);
    const canSpam = scoreCanSpam(body);
    const spamScore = scoreSpamTriggers(body);
    const subjectQuality = scoreSubjectQuality(subject, auditData.businessName);

    const total = Math.round(personalization + brevity + readability + canSpam + spamScore + subjectQuality);

    return {
        personalization,
        brevity,
        readability,
        canSpam,
        spamScore,
        subjectQuality,
        total: Math.min(100, total),
    };
}

export function isEmailAcceptable(breakdown: EmailScoreBreakdown, minScore: number = 70): boolean {
    return breakdown.total >= minScore;
}
