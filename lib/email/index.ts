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
  audit: any,
  proposal: any,
  playbook: any,
  options?: { tracker?: import('@/lib/costs/costTracker').CostTracker }
): Promise<{
  sequence: any;
  qualityPassed: boolean;
  attempts: number;
  finalReports: import('./qualityCheck').QualityReport[];
}> {
  const isObject = (val: any) => val !== null && typeof val === 'object';

  let proposalId = 'mock-proposal-id';
  let auditContext = '';
  let executiveSummary = '';
  let roiData = '';
  let meta: any = { industry: 'General', role: 'Owner', sizeScope: 'Small Business' };

  if (isObject(audit)) {
    proposalId = proposal?.id || audit?.id || 'mock-proposal-id';

    const businessName = audit?.businessName || 'Your Business';
    const city = audit?.businessCity || 'your city';
    const industry = audit?.businessIndustry || 'general';
    const findings = audit?.findings || [];
    const findingsText = findings
      .map((f: any) => `- ${f.title || f.category}: ${f.description || ''}`)
      .join('\n');

    auditContext = `BUSINESS: ${businessName}\nCITY: ${city}\nINDUSTRY: ${industry}\n\nFINDINGS:\n${findingsText}`;

    executiveSummary =
      proposal?.executiveSummary ||
      'A website performance and search presence assessment has been generated for your business.';

    roiData = proposal?.pricing
      ? `Pricing Tiers:\n- Starter: $${proposal.pricing.starter || '497'}/mo\n- Growth: $${proposal.pricing.growth || '1497'}/mo\n- Premium: $${proposal.pricing.premium || '2997'}/mo`
      : 'Pricing options range from $497 to $2997 depending on required depth.';

    meta = {
      industry: audit?.businessIndustry || 'General',
      role: 'Owner',
      sizeScope: 'Small Business',
    };
  } else {
    proposalId = audit;
    auditContext = proposal;
    executiveSummary = playbook || '';
    roiData = (options?.tracker as any) || '';
  }

  const rawSequence = await generateEmailSequence(
    proposalId,
    auditContext,
    executiveSummary,
    roiData,
    meta
  );

  const adaptedSequence: any = {
    emails: (rawSequence.emails || []).map((e: any) => ({
      dayOffset: e.step ? (e.step - 1) * 3 : 0,
      subject: e.subjectA || e.subject || 'Your Digital Presence Report',
      body: e.body || '',
      previewText: (e.body || '').substring(0, 60),
      personalizationScore: 9,
    })),
    metadata: {
      businessName: isObject(audit) ? audit.businessName || 'Your Business' : 'Your Business',
      vertical: isObject(audit) ? audit.businessIndustry || 'general' : 'general',
      topFinding: isObject(audit) ? audit.findings?.[0]?.title || 'Website speed' : 'Website speed',
      generatedAt: new Date().toISOString(),
    },
  };

  const { overallPass, reports } = checkEmailSequenceQuality(adaptedSequence);

  return {
    sequence: adaptedSequence,
    qualityPassed: overallPass,
    attempts: 1,
    finalReports: reports,
  };
}
