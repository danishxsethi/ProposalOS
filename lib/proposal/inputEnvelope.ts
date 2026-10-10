import { validateFinding } from '@/lib/audit/findingContract';
import { BEDROCK_NOVA_2_LITE } from '@/lib/config/models';

import type { Audit, EvidenceSnapshot, Finding } from '@prisma/client';

export interface ProposalInputEnvelope {
  version: 1;
  tenantId: string;
  auditId: string;
  business: {
    name: string;
    industry: string | null;
    city: string | null;
    url: string | null;
  };
  auditStatus: 'COMPLETE';
  trustState: 'TRUSTED';
  findings: Finding[];
  findingIds: string[];
  evidenceIds: string[];
  auditCompletedAt: Date | null;
  packageCatalogVersion: 'proposal-pricing-v1';
  claimPolicyVersion: 1;
  diagnosisGraphVersion: 'diagnosis-graph-v1';
  proposalGraphVersion: 'proposal-graph-v1';
  qaVersion: 1;
  promptVersion: string;
  modelProvider: 'amazon-bedrock';
  model: string;
}

type ProposalEnvelopeAudit = Pick<
  Audit,
  | 'id'
  | 'tenantId'
  | 'businessName'
  | 'businessIndustry'
  | 'businessCity'
  | 'businessUrl'
  | 'status'
  | 'trustState'
  | 'completedAt'
> & { findings: Finding[]; evidence?: EvidenceSnapshot[] };

/**
 * The exact finding-eligibility rule the proposal compiler uses: a Finding is
 * proposal-input-eligible only when it carries real evidence AND at least one
 * COMPLETE persisted evidence snapshot exists for its module.
 *
 * Shared with the public proposal access path so both agree on WHICH findings a
 * proposal was (or could be) compiled from. Without this shared definition, the
 * public access verifier compared the compiler's evidence-backed subset against
 * every non-excluded finding and permanently rejected delivery for any audit
 * that legitimately contains non-evidence-backed findings.
 */
export function isEvidenceBackedFinding(
  finding: { evidence?: unknown; module: string },
  completeModules: ReadonlySet<string>
): boolean {
  return (
    Array.isArray(finding.evidence) &&
    finding.evidence.length > 0 &&
    completeModules.has(finding.module)
  );
}

export function buildPublicProposalInputEnvelope(
  audit: ProposalEnvelopeAudit,
  evidenceSnapshots: EvidenceSnapshot[]
): ProposalInputEnvelope {
  if (audit.status !== 'COMPLETE' || audit.trustState !== 'TRUSTED') {
    throw new Error(`AUDIT_NOT_TRUSTED: status=${audit.status}, trustState=${audit.trustState}`);
  }
  const invalid = audit.findings.filter((finding) => !validateFinding(finding).success);
  if (invalid.length > 0) {
    throw new Error(`PROPOSAL_FINDINGS_INVALID: ${invalid.map((finding) => finding.id).join(',')}`);
  }
  return {
    version: 1,
    tenantId: audit.tenantId,
    auditId: audit.id,
    business: {
      name: audit.businessName,
      industry: audit.businessIndustry,
      city: audit.businessCity,
      url: audit.businessUrl,
    },
    auditStatus: 'COMPLETE',
    trustState: 'TRUSTED',
    findings: audit.findings,
    findingIds: audit.findings.map((finding) => finding.id),
    evidenceIds: evidenceSnapshots
      .filter((snapshot) => snapshot.observationStatus === 'COMPLETE')
      .map((snapshot) => snapshot.id),
    auditCompletedAt: audit.completedAt,
    packageCatalogVersion: 'proposal-pricing-v1',
    claimPolicyVersion: 1,
    diagnosisGraphVersion: 'diagnosis-graph-v1',
    proposalGraphVersion: 'proposal-graph-v1',
    qaVersion: 1,
    promptVersion: process.env.PROPOSAL_PROMPT_VERSION ?? 'unversioned',
    modelProvider: 'amazon-bedrock',
    model: BEDROCK_NOVA_2_LITE,
  };
}
