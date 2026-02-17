/**
 * Email quality checker — validates generated emails against standards.
 * Returns QualityReport with pass/fail and specific issues for re-generation.
 */
import type { EmailSequence } from './types';

export interface EmailToCheck {
  subject: string;
  body: string;
  previewText?: string;
  personalizationScore?: number;
}

export interface QualityReport {
  pass: boolean;
  score: number; // 0-100
  issues: string[];
  checks: {
    name: string;
    passed: boolean;
    detail?: string;
  }[];
}

const SPAM_TRIGGER_WORDS = [
  'free',
  'guaranteed',
  'act now',
  'limited time',
  'don\'t miss',
  'last chance',
  'hurry',
  'urgent',
  'immediately',
  'instant',
  'no obligation',
  'risk-free',
  '100% free',
  'winner',
  'congratulations',
  'you\'ve been selected',
  'claim now',
  'click here',
  'buy now',
];

const AGGRESSIVE_PATTERNS = [
  /\b(must|have to|need to)\s+(act|buy|sign)\b/i,
  /\b(only|just)\s+\d+\s+(left|remaining|spots)\b/i,
  /\b(limited|exclusive)\s+(offer|deal)\b/i,
  /!\s*!\s*!/,
  /\b(urgent|asap|immediately)\b/i,
];

export function checkEmailQuality(
  email: EmailToCheck,
  options?: { businessName?: string }
): QualityReport {
  const issues: string[] = [];
  const checks: QualityReport['checks'] = [];

  const subject = (email.subject || '').trim();
  const body = (email.body || '').trim();
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // 1. Personalization score >= 8
  const personalizationOk = (email.personalizationScore ?? 0) >= 8;
  checks.push({
    name: 'Personalization score >= 8',
    passed: personalizationOk,
    detail: `Score: ${email.personalizationScore ?? 'N/A'}`,
  });
  if (!personalizationOk) issues.push('Personalization score must be >= 8 (references real audit data)');

  // 2. Word count <= 150
  const wordCountOk = wordCount <= 150;
  checks.push({
    name: 'Word count <= 150',
    passed: wordCountOk,
    detail: `${wordCount} words`,
  });
  if (!wordCountOk) issues.push(`Word count ${wordCount} exceeds 150`);

  // 3. No spam trigger words
  const lowerBody = body.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  const spamWordsFound = SPAM_TRIGGER_WORDS.filter(
    (w) => lowerBody.includes(w) || lowerSubject.includes(w)
  );
  const noSpamOk = spamWordsFound.length === 0;
  checks.push({
    name: 'No spam trigger words',
    passed: noSpamOk,
    detail: noSpamOk ? undefined : `Found: ${spamWordsFound.join(', ')}`,
  });
  if (!noSpamOk) issues.push(`Remove spam words: ${spamWordsFound.join(', ')}`);

  // 4. Subject line <= 60 characters
  const subjectLenOk = subject.length <= 60;
  checks.push({
    name: 'Subject <= 60 chars',
    passed: subjectLenOk,
    detail: `${subject.length} chars`,
  });
  if (!subjectLenOk) issues.push(`Subject line ${subject.length} chars (max 60)`);

  // 5. Has specific number/metric from audit
  const hasMetric = /\d+(\.\d+)?(\s*%|\s*seconds?|\s*ms|\s*score|\s*rating|\s*reviews?|\s*points?)/i.test(body) ||
    /\d+(\s*out of|\/\s*\d+)/.test(body);
  checks.push({
    name: 'Has specific metric/number',
    passed: hasMetric,
  });
  if (!hasMetric) issues.push('Include at least one specific number or metric from the audit');

  // 6. Has business name (optional — if businessName provided)
  if (options?.businessName) {
    const nameOk = lowerBody.includes(options.businessName.toLowerCase());
    checks.push({ name: 'Has business name', passed: nameOk });
    if (!nameOk) issues.push(`Include business name "${options.businessName}"`);
  }

  // 7. Has clear CTA
  const hasCta = /\?|→|click|reply|send|forward|link|here'?s the/i.test(body) ||
    /want (me to |the )|just reply|get (started|the )/i.test(body);
  checks.push({
    name: 'Has clear CTA',
    passed: hasCta,
  });
  if (!hasCta) issues.push('Include a clear call-to-action');

  // 8. No aggressive/salesy language
  const aggressiveFound = AGGRESSIVE_PATTERNS.some((p) => p.test(body) || p.test(subject));
  const noAggressiveOk = !aggressiveFound;
  checks.push({
    name: 'No aggressive/salesy language',
    passed: noAggressiveOk,
  });
  if (!noAggressiveOk) issues.push('Remove aggressive or salesy language');

  // 9. CAN-SPAM: unsubscribe placeholder
  const hasUnsubscribe = /unsubscribe|reply stop|opt.?out|remove (yourself|me)/i.test(body);
  checks.push({
    name: 'CAN-SPAM: Unsubscribe',
    passed: hasUnsubscribe,
  });
  if (!hasUnsubscribe) issues.push('Add unsubscribe instruction (e.g. "Reply STOP to unsubscribe")');

  // 10. CAN-SPAM: physical address placeholder
  const hasAddress = /address|physical address|our (address|location)|\[.*address.*\]/i.test(body);
  checks.push({
    name: 'CAN-SPAM: Physical address',
    passed: hasAddress,
  });
  if (!hasAddress) issues.push('Add physical address placeholder (e.g. "Our address: [Your Business Address]")');

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const pass = issues.length === 0;

  return {
    pass,
    score,
    issues,
    checks,
  };
}

/**
 * Check a full email sequence — returns reports per email and overall pass.
 */
export function checkEmailSequenceQuality(
  sequence: EmailSequence,
  options?: { businessName?: string }
): {
  overallPass: boolean;
  reports: QualityReport[];
  failedEmails: number[];
} {
  const reports = sequence.emails.map((e) =>
    checkEmailQuality(
      {
        subject: e.subject,
        body: e.body,
        previewText: e.previewText,
        personalizationScore: e.personalizationScore,
      },
      { businessName: options?.businessName ?? sequence.metadata.businessName }
    )
  );

  const failedEmails = reports
    .map((r, i) => (r.pass ? -1 : i))
    .filter((i) => i >= 0);

  return {
    overallPass: failedEmails.length === 0,
    reports,
    failedEmails,
  };
}
