const TARGET_MAX_WORDS = 80;
const TARGET_MAX_GRADE = 5.5;

const SPAM_TERMS = [
    'guaranteed',
    'act now',
    'limited time',
    'winner',
    'cash',
    'money back',
    'free money',
    'buy now',
    'click here',
    'urgent',
    'miracle',
    'secret',
];

const JARGON_TERMS = [
    'core web vitals',
    'schema markup',
    'technical seo',
    'canonical',
    'crawl budget',
    'meta tags',
    'accessibility violations',
    'backlink profile',
];

export interface SniperEmailQualityInput {
    subject: string;
    body: string;
    requiredFindingSnippets: string[];
}

export interface SniperEmailQualityResult {
    pass: boolean;
    score: number;
    hardFails: string[];
    issues: string[];
    wordCount: number;
    readabilityGrade: number;
    findingsReferenced: number;
    metricMentions: number;
    spamRisk: number;
}

function normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSyllables(word: string): number {
    let normalized = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!normalized) return 1;
    if (normalized.length <= 3) return 1;
    normalized = normalized.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    normalized = normalized.replace(/^y/, '');
    const matches = normalized.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

function fleschKincaidGrade(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    if (words.length === 0) return 0;
    const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
    const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
}

function countMetricMentions(text: string): number {
    const matches = text.match(/\b\d+(?:\.\d+)?(?:\s*(?:%|s|sec|seconds|ms|reviews?|rating|score|points?))?\b/gi);
    return matches ? matches.length : 0;
}

function countFindingsReferenced(body: string, requiredFindingSnippets: string[]): number {
    const normalizedBody = normalize(body);
    const snippets = requiredFindingSnippets
        .map((snippet) => normalize(snippet))
        .filter(Boolean);

    let count = 0;
    for (const snippet of snippets) {
        if (normalizedBody.includes(snippet)) count += 1;
    }
    return count;
}

export function checkSniperEmailQuality(input: SniperEmailQualityInput): SniperEmailQualityResult {
    const body = input.body.trim();
    const fullText = `${input.subject} ${body}`.trim();
    const lowerFullText = fullText.toLowerCase();

    const wordCount = countWords(body);
    const readabilityGrade = fleschKincaidGrade(body);
    const metricMentions = countMetricMentions(body);
    const findingsReferenced = countFindingsReferenced(body, input.requiredFindingSnippets);
    const spamMatches = SPAM_TERMS.filter((term) => lowerFullText.includes(term));
    const jargonMatches = JARGON_TERMS.filter((term) => lowerFullText.includes(term));
    const spamRisk = Math.min(100, spamMatches.length * 25 + jargonMatches.length * 20);

    const hardFails: string[] = [];
    if (wordCount > TARGET_MAX_WORDS) hardFails.push(`Word count ${wordCount} exceeds ${TARGET_MAX_WORDS}`);
    if (readabilityGrade > TARGET_MAX_GRADE) hardFails.push(`Reading grade ${readabilityGrade} is above ${TARGET_MAX_GRADE}`);
    if (findingsReferenced < 2) hardFails.push('References fewer than 2 specific audit findings');
    if (metricMentions < 2) hardFails.push('Has fewer than 2 quantified metrics');
    if (spamMatches.length > 0) hardFails.push(`Contains spam terms: ${spamMatches.join(', ')}`);
    if (jargonMatches.length > 0) hardFails.push(`Contains jargon: ${jargonMatches.join(', ')}`);

    let score = 100;
    score -= wordCount > TARGET_MAX_WORDS ? 35 : 0;
    score -= readabilityGrade > TARGET_MAX_GRADE ? 20 : 0;
    score -= findingsReferenced >= 2 ? 0 : 25;
    score -= metricMentions >= 2 ? 0 : 20;
    score -= spamMatches.length * 10;
    score -= jargonMatches.length * 8;
    score = Math.max(0, Math.min(100, score));

    const issues: string[] = [];
    if (wordCount > 65 && wordCount <= TARGET_MAX_WORDS) issues.push('Copy is near the 80-word limit');
    if (readabilityGrade > 4.5 && readabilityGrade <= TARGET_MAX_GRADE) issues.push('Readability is close to hard threshold');
    if (metricMentions === 2) issues.push('Only minimum metric references detected');
    if (findingsReferenced === 2) issues.push('Only minimum finding references detected');

    const pass = hardFails.length === 0 && score >= 90;

    return {
        pass,
        score,
        hardFails,
        issues,
        wordCount,
        readabilityGrade,
        findingsReferenced,
        metricMentions,
        spamRisk,
    };
}

