import { validateFinding } from '@/lib/audit/findingContract';

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
  modelProvider: 'google-generative-ai';
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
    modelProvider: 'google-generative-ai',
    model: process.env.GEMINI_PROPOSAL_MODEL ?? 'gemini-2.0-flash',
  };
}
