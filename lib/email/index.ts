/**
 * Email generation pipeline — cold outreach + follow-up sequences.
 *
 * Pipeline:
 * 1. generateEmailSequence(audit, proposal, playbook) → 4-email cold sequence
 * 2. checkEmailSequenceQuality(sequence) → validate each email
 * 3. If fails: regenerateEmailsWithFeedback(...) → fix failed emails
 * 4. For in-person: generateFollowUpSequence(input) → 3-email warm sequence
 */
import { generateEmailSequence, regenerateEmailsWithFeedback } from './generator';
import { checkEmailSequenceQuality } from './qualityCheck';
import { generateFollowUpSequence } from './followUp';

export type {
  AuditForEmail,
  ProposalForEmail,
  PlaybookForEmail,
  EmailSequence,
  FollowUpSequence,
  FindingForEmail,
  ComparisonReportForEmail,
} from './types';

export type { EmailToCheck, QualityReport } from './qualityCheck';

export type { FollowUpInput } from './followUp';

export { generateEmailSequence, regenerateEmailsWithFeedback } from './generator';
export { checkEmailQuality, checkEmailSequenceQuality } from './qualityCheck';
export { generateFollowUpSequence } from './followUp';

const MAX_REGENERATE_ATTEMPTS = 2;

/**
 * Full pipeline: generate 4-email sequence, validate, regenerate failed emails up to 2 times.
 */
export async function runEmailPipeline(
  audit: Parameters<typeof generateEmailSequence>[0],
  proposal: Parameters<typeof generateEmailSequence>[1],
  playbook: Parameters<typeof generateEmailSequence>[2] | null,
  options?: { tracker?: import('@/lib/costs/costTracker').CostTracker }
): Promise<{
  sequence: Awaited<ReturnType<typeof generateEmailSequence>>;
  qualityPassed: boolean;
  attempts: number;
  finalReports: import('./qualityCheck').QualityReport[];
}> {
  let sequence = await generateEmailSequence(audit, proposal, playbook, options?.tracker);
  let { overallPass, reports, failedEmails } = checkEmailSequenceQuality(sequence);
  let attempts = 1;

  while (!overallPass && failedEmails.length > 0 && attempts < MAX_REGENERATE_ATTEMPTS) {
    sequence = await regenerateEmailsWithFeedback(
      audit,
      proposal,
      playbook,
      sequence,
      failedEmails,
      reports,
      options?.tracker
    );
    const next = checkEmailSequenceQuality(sequence);
    overallPass = next.overallPass;
    reports = next.reports;
    failedEmails = next.failedEmails;
    attempts++;
  }

  return {
    sequence,
    qualityPassed: overallPass,
    attempts,
    finalReports: reports,
  };
}
