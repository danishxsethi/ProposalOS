import { prisma } from '@/lib/prisma';
import {
  assertProposalPublishable,
  proposalPublicationFingerprint,
} from '@/lib/proposal/publication';
import { runWithTenantBypass } from '@/lib/tenant/context';

const PUBLIC_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface PublicProposalFinding {
  id: string;
  module: string;
  category: string;
  type: string;
  title: string;
  description: string | null;
  impactScore: number;
  effortEstimate: string | null;
  recommendedFix: string[];
  metrics: Record<string, number>;
}

export interface PublicProposalDto {
  id: string;
  version: number;
  webLinkToken: string;
  executiveSummary: string | null;
  pricing: { essentials?: number; growth?: number; premium?: number };
  tierEssentials: Record<string, unknown>;
  tierGrowth: Record<string, unknown>;
  tierPremium: Record<string, unknown>;
  nextSteps: string[];
  assumptions: string[];
  disclaimers: string[];
  createdAt: Date;
  audit: {
    status: string;
    trustState: string;
    businessName: string;
    businessCity: string | null;
    businessIndustry: string | null;
    overallScore: number | null;
    startedAt: Date;
    completedAt: Date | null;
    findings: PublicProposalFinding[];
  };
}

export class PublicProposalAccessError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function publicTier(value: unknown): Record<string, unknown> {
  const tier = asRecord(value);
  const features = Array.isArray(tier.features)
    ? tier.features.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    name: typeof tier.name === 'string' ? tier.name : '',
    deliveryTime: typeof tier.deliveryTime === 'string' ? tier.deliveryTime : '',
    features,
  };
}

function publicPricing(value: unknown): PublicProposalDto['pricing'] {
  const pricing = asRecord(value);
  const result: PublicProposalDto['pricing'] = {};
  for (const key of ['essentials', 'growth', 'premium'] as const) {
    const amount = pricing[key];
    if (typeof amount === 'number' && Number.isFinite(amount)) result[key] = amount;
  }
  return result;
}

function publicFinding(
  finding: {
    module: string;
    category: string;
    type: string;
    title: string;
    description: string | null;
    impactScore: number;
    effortEstimate: string | null;
    recommendedFix: unknown;
    metrics: unknown;
  },
  index: number
): PublicProposalFinding {
  const fixes = Array.isArray(finding.recommendedFix)
    ? finding.recommendedFix
        .map((item) => {
          if (typeof item === 'string') return item;
          const record = asRecord(item);
          const text = record.action ?? record.description;
          return typeof text === 'string' ? text : null;
        })
        .filter((item): item is string => item !== null)
    : typeof finding.recommendedFix === 'string'
      ? [finding.recommendedFix]
      : [];

  const sourceMetrics = asRecord(finding.metrics);
  const metrics: Record<string, number> = {};
  for (const key of ['performanceScore', 'seoScore', 'accessibilityScore', 'score']) {
    const value = sourceMetrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) metrics[key] = value;
  }

  return {
    id: `finding-${index + 1}`,
    module: finding.module,
    category: finding.category,
    type: finding.type,
    title: finding.title,
    description: finding.description,
    impactScore: finding.impactScore,
    effortEstimate: finding.effortEstimate,
    recommendedFix: fixes,
    metrics,
  };
}

/** Resolves every bearer-token proposal read and returns only customer-facing fields. */
export async function resolvePublicProposalAccess(token: string): Promise<{
  proposal: PublicProposalDto;
  tenantId: string;
  proposalId: string;
  status: string;
  replyReceivedAt: Date | null;
  outcome: string | null;
  tierChosen: string | null;
}> {
  if (!token || token.length > 256) {
    throw new PublicProposalAccessError('Proposal not found', 404);
  }

  const proposal = await runWithTenantBypass('public-proposal-token-resolution', () =>
    prisma.proposal.findUnique({
      where: { webLinkToken: token },
      select: {
        id: true,
        auditId: true,
        tenantId: true,
         version: true,
        status: true,
        publicAccessRevokedAt: true,
        publicationFingerprint: true,
        replyReceivedAt: true,
        outcome: true,
        tierChosen: true,
        createdAt: true,
        executiveSummary: true,
        painClusters: true,
        pricing: true,
        tierEssentials: true,
        tierGrowth: true,
        tierPremium: true,
        nextSteps: true,
        assumptions: true,
        disclaimers: true,
         qaResults: true,
        audit: {
          select: {
            status: true,
            trustState: true,
            businessName: true,
            businessCity: true,
        businessIndustry: true,
        overallScore: true,
            startedAt: true,
            completedAt: true,
            findings: {
              where: { excluded: false },
              orderBy: { impactScore: 'desc' },
              select: {
                id: true,
                auditId: true,
                tenantId: true,
                module: true,
                category: true,
                type: true,
                title: true,
                description: true,
                impactScore: true,
                confidenceScore: true,
                effortEstimate: true,
                recommendedFix: true,
                metrics: true,
                evidence: true,
                manuallyEdited: true,
                excluded: true,
              },
            },
            evidence: {
              where: { observationStatus: 'COMPLETE' },
              orderBy: { id: 'asc' },
              select: {
                id: true,
                auditId: true,
                tenantId: true,
                module: true,
                source: true,
                targetUrl: true,
                providerRequestId: true,
                methodVersion: true,
                observationStatus: true,
                rawResponse: true,
                collectedAt: true,
              },
            },
          },
        },
      },
    })
  );

  if (!proposal) throw new PublicProposalAccessError('Proposal not found', 404);
  if (proposal.publicAccessRevokedAt) {
    throw new PublicProposalAccessError('Proposal access has been revoked', 410);
  }
  if (proposal.status === 'REJECTED') {
    throw new PublicProposalAccessError('Proposal has been rejected', 410);
  }
  if (Date.now() - proposal.createdAt.getTime() > PUBLIC_TOKEN_MAX_AGE_MS) {
    throw new PublicProposalAccessError('Proposal has expired', 410);
  }
  if (proposal.audit.status !== 'COMPLETE' || proposal.audit.trustState !== 'TRUSTED') {
    throw new PublicProposalAccessError('Audit is not trusted for public proposal access', 404);
  }
  if (proposal.audit.businessName.trim().length === 0) {
    throw new PublicProposalAccessError('Proposal business identity is unavailable', 404);
  }
  const qaResults = asRecord(proposal.qaResults);
  const provenance = asRecord(qaResults.provenance);
  if (
    provenance.proposalInputVersion !== 1 ||
    !Array.isArray(provenance.findingIds) ||
    !Array.isArray(provenance.evidenceIds) ||
    provenance.evidenceIds.length === 0
  ) {
    throw new PublicProposalAccessError('Proposal evidence provenance is unavailable', 404);
  }
  const sourceFindingIds = new Set(
    (provenance.findingIds as unknown[]).filter((id): id is string => typeof id === 'string')
  );
  const evidenceIds = new Set(
    (provenance.evidenceIds as unknown[]).filter((id): id is string => typeof id === 'string')
  );
  const findingEvidenceBindings = asRecord(provenance.findingEvidenceIds);
  const persistedEvidence = proposal.audit.evidence ?? [];
  const persistedEvidenceIds = new Set(persistedEvidence.map((snapshot) => snapshot.id));
  if (
    evidenceIds.size === 0 ||
    evidenceIds.size !== persistedEvidenceIds.size ||
    [...evidenceIds].some((id) => !persistedEvidenceIds.has(id))
  ) {
    throw new PublicProposalAccessError('Proposal evidence version is stale or incomplete', 404);
  }
  const findingIds = new Set(proposal.audit.findings.map((finding) => finding.id));
  if (sourceFindingIds.size === 0 || [...sourceFindingIds].some((id) => !findingIds.has(id))) {
    throw new PublicProposalAccessError('Proposal finding version is stale or incomplete', 404);
  }
  if (sourceFindingIds.size !== findingIds.size) {
    throw new PublicProposalAccessError('Audit findings changed after proposal approval', 404);
  }
  const grounded = asRecord(qaResults.grounding);
  const groundedClaims = Array.isArray(grounded.claims) ? grounded.claims : [];
  const groundedFindingIds = new Set<string>();
  for (const claim of groundedClaims) {
    const sourceIds = asRecord(claim).sourceFindingIds;
    if (!Array.isArray(sourceIds)) {
      throw new PublicProposalAccessError('Proposal contains an ungrounded public claim', 404);
    }
    if (sourceIds.length === 0) {
      const claimType = asRecord(claim).claimType;
      const configurationRefs = asRecord(claim).configurationRefs;
      if (claimType !== 'COMMERCIAL_CONFIGURATION' || !Array.isArray(configurationRefs) || configurationRefs.length === 0) {
        throw new PublicProposalAccessError('Proposal contains an ungrounded public claim', 404);
      }
      continue;
    }
    for (const sourceId of sourceIds) {
      if (typeof sourceId !== 'string' || !sourceFindingIds.has(sourceId)) {
        throw new PublicProposalAccessError('Public claim references a foreign Finding', 404);
      }
      groundedFindingIds.add(sourceId);
    }
  }
  const publicationFingerprint = typeof qaResults.publicationFingerprint === 'string'
    ? qaResults.publicationFingerprint
    : null;
  if (publicationFingerprint) {
    const publishedPrices = asRecord(asRecord(grounded.commercial).prices);
    const currentPrices = asRecord(proposal.pricing);
    for (const tier of ['essentials', 'growth', 'premium'] as const) {
      if (publishedPrices[tier] !== currentPrices[tier]) {
        throw new PublicProposalAccessError('Proposal commercial terms changed after QA approval', 404);
      }
    }
    for (const tier of ['essentials', 'growth', 'premium'] as const) {
      const bindings = asRecord(asRecord(asRecord(grounded.bindings).tiers)[tier]);
      const currentTierByName = {
        essentials: proposal.tierEssentials,
        growth: proposal.tierGrowth,
        premium: proposal.tierPremium,
      };
      const currentTier = asRecord(currentTierByName[tier]);
      const description = groundedClaims.find((claim) => asRecord(claim).claimId === bindings.description);
      if (asRecord(description).text !== currentTier.description) {
        throw new PublicProposalAccessError('Proposal tier content changed after QA approval', 404);
      }
      const features = Array.isArray(currentTier.features) ? currentTier.features : [];
      const featureBindings = Array.isArray(bindings.features) ? bindings.features : [];
      if (
        features.length !== featureBindings.length ||
        features.some((feature, index) => {
          const claim = groundedClaims.find((item) => asRecord(item).claimId === featureBindings[index]);
          return asRecord(claim).text !== feature;
        })
      ) {
        throw new PublicProposalAccessError('Proposal tier features changed after QA approval', 404);
      }
      const priceClaim = groundedClaims.find((claim) => asRecord(claim).claimId === bindings.price);
      const priceText = asRecord(priceClaim).text;
      if (
        typeof priceText !== 'string' ||
        !priceText.includes(String(currentPrices[tier]))
      ) {
        throw new PublicProposalAccessError('Proposal price claim changed after QA approval', 404);
      }
    }
  }
  if (groundedClaims.length === 0 || [...sourceFindingIds].some((id) => !groundedFindingIds.has(id))) {
    throw new PublicProposalAccessError('Proposal finding lineage is incomplete', 404);
  }
  for (const finding of proposal.audit.findings) {
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
      throw new PublicProposalAccessError('Proposal finding is missing evidence', 404);
    }
    const findingEvidence = asRecord(finding.metrics);
    const findingSourceIds = Array.isArray(findingEvidence.sourceEvidenceIds)
      ? findingEvidence.sourceEvidenceIds.filter((id): id is string => typeof id === 'string')
      : [];
    const compiledEvidenceIds = findingEvidenceBindings[finding.id];
    const validSnapshotIds = new Set(
      persistedEvidence
        .filter((snapshot) => snapshot.module === finding.module)
        .map((snapshot) => snapshot.id)
    );
    if (
      !Array.isArray(compiledEvidenceIds) ||
      compiledEvidenceIds.length === 0 ||
      compiledEvidenceIds.some(
        (id) => typeof id !== 'string' || !validSnapshotIds.has(id) || !evidenceIds.has(id)
      ) ||
      findingSourceIds.some((id) => !validSnapshotIds.has(id))
    ) {
      throw new PublicProposalAccessError('Proposal finding is not bound to persisted audit evidence', 404);
    }
  }
  if (!['READY', 'SENT', 'VIEWED', 'ACCEPTED', 'PAID'].includes(proposal.status)) {
    throw new PublicProposalAccessError('Proposal is not available for public access', 404);
  }
  if (!Number.isInteger(proposal.version) || proposal.version < 1) {
    throw new PublicProposalAccessError('Proposal version is unavailable', 410);
  }
  const approval = asRecord(qaResults.publicationApproval);
  const storedFingerprint = typeof qaResults.publicationFingerprint === 'string'
    ? qaResults.publicationFingerprint
    : null;
  const currentFingerprint = proposalPublicationFingerprint({
    auditId: proposal.auditId,
    tenantId: proposal.tenantId,
    businessName: proposal.audit.businessName,
    businessCity: proposal.audit.businessCity,
    businessIndustry: proposal.audit.businessIndustry,
    auditOverallScore: proposal.audit.overallScore,
    auditStartedAt: proposal.audit.startedAt,
    auditCompletedAt: proposal.audit.completedAt,
    version: proposal.version,
    executiveSummary: proposal.executiveSummary,
    painClusters: proposal.painClusters,
    tiers: {
      essentials: proposal.tierEssentials,
      growth: proposal.tierGrowth,
      premium: proposal.tierPremium,
    },
    pricing: proposal.pricing,
    assumptions: proposal.assumptions,
    disclaimers: proposal.disclaimers,
    nextSteps: proposal.nextSteps,
    grounding: qaResults.grounding,
    provenance: qaResults.provenance,
    findings: proposal.audit.findings.map((finding) => ({
      id: finding.id,
      auditId: finding.auditId,
      tenantId: finding.tenantId,
      module: finding.module,
      category: finding.category,
      type: finding.type,
      title: finding.title,
      description: finding.description,
      impactScore: finding.impactScore,
      confidenceScore: finding.confidenceScore,
      effortEstimate: finding.effortEstimate,
      recommendedFix: finding.recommendedFix,
      metrics: finding.metrics,
      evidence: finding.evidence,
      manuallyEdited: finding.manuallyEdited,
      excluded: finding.excluded,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    evidenceSnapshots: [...persistedEvidence].sort((left, right) => left.id.localeCompare(right.id)),
  });
  if (
    approval.proposalVersion !== proposal.version ||
    approval.decision !== 'APPROVED' ||
    !storedFingerprint ||
    proposal.publicationFingerprint !== storedFingerprint ||
    approval.fingerprint !== storedFingerprint ||
    storedFingerprint !== currentFingerprint
  ) {
    throw new PublicProposalAccessError('Proposal version has no current publication approval', 404);
  }

  try {
    assertProposalPublishable(proposal);
  } catch {
    throw new PublicProposalAccessError('Proposal is not available for public access', 404);
  }

  return {
    tenantId: proposal.tenantId,
    proposalId: proposal.id,
    status: proposal.status,
    replyReceivedAt: proposal.replyReceivedAt,
    outcome: proposal.outcome,
    tierChosen: proposal.tierChosen,
    proposal: {
      id: proposal.id,
      version: proposal.version,
      webLinkToken: token,
      executiveSummary: proposal.executiveSummary,
      pricing: publicPricing(proposal.pricing),
      tierEssentials: publicTier(proposal.tierEssentials),
      tierGrowth: publicTier(proposal.tierGrowth),
      tierPremium: publicTier(proposal.tierPremium),
      nextSteps: proposal.nextSteps,
      assumptions: proposal.assumptions,
      disclaimers: proposal.disclaimers,
      createdAt: proposal.createdAt,
      audit: {
        status: proposal.audit.status,
        trustState: proposal.audit.trustState,
        businessName: proposal.audit.businessName,
        businessCity: proposal.audit.businessCity,
        businessIndustry: proposal.audit.businessIndustry,
        overallScore: proposal.audit.overallScore,
        startedAt: proposal.audit.startedAt,
        completedAt: proposal.audit.completedAt,
        findings: proposal.audit.findings.map(publicFinding),
      },
    },
  };
}

export async function resolvePublicProposal(token: string): Promise<PublicProposalDto> {
  return (await resolvePublicProposalAccess(token)).proposal;
}
