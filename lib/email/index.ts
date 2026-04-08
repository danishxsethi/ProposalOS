/**
 * Email generation pipeline — cold outreach + follow-up sequences.
 *
 * Pipeline:
 * 1. generateEmailSequence(audit, proposal, playbook) → 4-email cold sequence
 * 2. checkEmailSequenceQuality(sequence) → validate each email
 * 3. For in-person: generateFollowUpSequence(input) → 3-email warm sequence
 */
import { generateFollowUpSequence } from './followUp';
import { generateEmailSequenceNode as generateEmailSequence } from './generator';
import { checkEmailSequenceQuality } from './qualityCheck';

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

export { generateEmailSequenceNode as generateEmailSequence } from './generator';
export { checkEmailQuality, checkEmailSequenceQuality } from './qualityCheck';
export { generateFollowUpSequence } from './followUp';

/**
 * Full pipeline: generate 4-email sequence and validate.
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
  const sequence = await generateEmailSequence(
    audit as any,
    proposal as any,
    playbook as any,
    options?.tracker as any,
    '' as any
  );
  const { overallPass, reports } = checkEmailSequenceQuality(sequence as any);

  return {
    sequence,
    qualityPassed: overallPass,
    attempts: 1,
    finalReports: reports,
  };
}
