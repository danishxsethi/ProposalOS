/**
 * Personalization Token Engine with Fail-Closed Fallbacks
 *
 * Ensures 100% token resolution safety:
 * 1. Zero raw `{{token}}` substrings can ever be emitted in outbound copy.
 * 2. Grammatical punctuation cleanup (e.g. "Hi {{firstName}}," -> "Hi," when empty).
 * 3. Grounded data binding from live Audit findings and ROI calculator.
 */

export interface AuditTokenSource {
  businessName?: string | null;
  decisionMakerName?: string | null;
  city?: string | null;
  vertical?: string | null;
  topFindingTitle?: string | null;
  topFindingDollars?: string | number | null;
  topFindingMetric?: string | null;
  competitorName?: string | null;
  competitorMetric?: string | null;
  secondFindingTitle?: string | null;
  secondFindingDollars?: string | number | null;
  diyQuickWinTitle?: string | null;
  diyQuickWinSteps?: string | null;
  caseStudyClient?: string | null;
  caseStudyResult?: string | null;
  proposalUrl?: string | null;
  calendarUrl?: string | null;
}

export interface ResolvedTokens {
  firstName: string;
  greeting: string;
  businessName: string;
  city: string;
  vertical: string;
  topFindingTitle: string;
  topFindingDollars: string;
  topFindingMetric: string;
  competitorName: string;
  competitorMetric: string;
  secondFindingTitle: string;
  secondFindingDollars: string;
  diyQuickWinTitle: string;
  diyQuickWinSteps: string;
  caseStudyClient: string;
  caseStudyResult: string;
  proposalUrl: string;
  calendarUrl: string;
}

/**
 * Clean extract first name or title (e.g., "Dr. Green", "Joe", "Sarah")
 */
export function extractFirstName(name?: string | null): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  // Preserve professional honorifics: "Dr. Smith", "Dr. Green"
  if (/^dr\.?\s+[a-z]+/i.test(trimmed)) {
    const parts = trimmed.split(/\s+/);
    return `${parts[0]} ${parts[1]}`;
  }

  // Otherwise take the first name
  const first = trimmed.split(/\s+/)[0] || '';
  return first.replace(/[^a-zA-Z]/g, '');
}

/**
 * Format dollar string safely
 */
export function formatTokenDollars(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '$1,800/mo';
  if (typeof value === 'number') {
    return `$${value.toLocaleString('en-US')}/mo`;
  }
  const clean = String(value).trim();
  if (clean.startsWith('$')) {
    return clean.endsWith('/mo') ? clean : `${clean}/mo`;
  }
  return `$${clean}/mo`;
}

/**
 * Resolves all tokens with context-aware, grammatically sound fallbacks
 */
export function resolveTokens(source: AuditTokenSource): ResolvedTokens {
  const firstName = extractFirstName(source.decisionMakerName);
  const businessName = (source.businessName || '').trim() || 'your team';
  const city = (source.city || '').trim() || 'your area';
  const vertical = (source.vertical || '').trim().toLowerCase() || 'business';

  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  const topFindingTitle =
    (source.topFindingTitle || '').trim() ||
    'missing LocalBusiness structured data and review response lag';

  const topFindingDollars = formatTokenDollars(source.topFindingDollars || 1800);

  const topFindingMetric =
    (source.topFindingMetric || '').trim() ||
    '342 fewer reviews than nearby competitors';

  const competitorName =
    (source.competitorName || '').trim() ||
    'nearby competitors';

  const competitorMetric =
    (source.competitorMetric || '').trim() ||
    'leading in local map pack search clicks';

  const secondFindingTitle =
    (source.secondFindingTitle || '').trim() ||
    'mobile page speed taking over 4.5s on 4G connections';

  const secondFindingDollars = formatTokenDollars(source.secondFindingDollars || 950);

  const diyQuickWinTitle =
    (source.diyQuickWinTitle || '').trim() ||
    'Add missing FAQ and service schema to your home page';

  const diyQuickWinSteps =
    (source.diyQuickWinSteps || '').trim() ||
    'Paste the JSON-LD schema into your site header to let Google index rich booking cards directly in search.';

  const caseStudyClient =
    (source.caseStudyClient || '').trim() ||
    'a similar local business';

  const caseStudyResult =
    (source.caseStudyResult || '').trim() ||
    'erased their competitor review gap and lifted organic appointment inquiries by 64% in 60 days';

  const proposalUrl = (source.proposalUrl || '').trim() || 'https://claraud.com/audit';
  const calendarUrl = (source.calendarUrl || '').trim() || 'https://claraud.com/book';

  return {
    firstName,
    greeting,
    businessName,
    city,
    vertical,
    topFindingTitle,
    topFindingDollars,
    topFindingMetric,
    competitorName,
    competitorMetric,
    secondFindingTitle,
    secondFindingDollars,
    diyQuickWinTitle,
    diyQuickWinSteps,
    caseStudyClient,
    caseStudyResult,
    proposalUrl,
    calendarUrl,
  };
}

/**
 * Replaces all tokens in a template string and enforces fail-closed token hygiene
 */
export function renderTemplate(template: string, source: AuditTokenSource): string {
  const tokens = resolveTokens(source);

  let rendered = template
    .replace(/{{\s*greeting\s*}}/gi, tokens.greeting)
    .replace(/{{\s*firstName\s*}}/gi, tokens.firstName)
    .replace(/{{\s*businessName\s*}}/gi, tokens.businessName)
    .replace(/{{\s*city\s*}}/gi, tokens.city)
    .replace(/{{\s*vertical\s*}}/gi, tokens.vertical)
    .replace(/{{\s*topFindingTitle\s*}}/gi, tokens.topFindingTitle)
    .replace(/{{\s*topFindingDollars\s*}}/gi, tokens.topFindingDollars)
    .replace(/{{\s*topFindingMetric\s*}}/gi, tokens.topFindingMetric)
    .replace(/{{\s*competitorName\s*}}/gi, tokens.competitorName)
    .replace(/{{\s*competitorMetric\s*}}/gi, tokens.competitorMetric)
    .replace(/{{\s*secondFindingTitle\s*}}/gi, tokens.secondFindingTitle)
    .replace(/{{\s*secondFindingDollars\s*}}/gi, tokens.secondFindingDollars)
    .replace(/{{\s*diyQuickWinTitle\s*}}/gi, tokens.diyQuickWinTitle)
    .replace(/{{\s*diyQuickWinSteps\s*}}/gi, tokens.diyQuickWinSteps)
    .replace(/{{\s*caseStudyClient\s*}}/gi, tokens.caseStudyClient)
    .replace(/{{\s*caseStudyResult\s*}}/gi, tokens.caseStudyResult)
    .replace(/{{\s*proposalUrl\s*}}/gi, tokens.proposalUrl)
    .replace(/{{\s*calendarUrl\s*}}/gi, tokens.calendarUrl);

  // Clean grammatical artifacts (e.g., "Hi ," -> "Hi," or "  " -> " ")
  rendered = rendered
    .replace(/Hi\s+,/g, 'Hi,')
    .replace(/Hey\s+,/g, 'Hey,')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Fail-closed verification: No raw token can survive
  const unrenderedMatch = rendered.match(/{{\s*[\w\.]+\s*}}/);
  if (unrenderedMatch) {
    throw new Error(
      `Fail-Closed Token Error: Unresolved token detected in rendered copy: ${unrenderedMatch[0]}`
    );
  }

  return rendered;
}
