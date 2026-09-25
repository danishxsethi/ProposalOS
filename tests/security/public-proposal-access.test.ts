// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  runWithTenantBypass: vi.fn((_label: string, callback: () => unknown) => callback()),
  assertProposalPublishable: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { proposal: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/tenant/context', () => ({ runWithTenantBypass: mocks.runWithTenantBypass }));
vi.mock('@/lib/proposal/publication', () => ({
  assertProposalPublishable: mocks.assertProposalPublishable,
  proposalPublicationFingerprint: (state: unknown) => JSON.stringify(state),
}));

import {
  PublicProposalAccessError,
  resolvePublicProposalAccess,
} from '@/lib/proposal/publicAccess';

const proposal = {
  id: 'proposal-1',
  auditId: 'audit-1',
  tenantId: 'tenant-1',
  version: 3,
  status: 'SENT',
  publicAccessRevokedAt: null,
  publicationFingerprint: '',
  createdAt: new Date(),
  executiveSummary: 'Summary',
  painClusters: [],
  pricing: { essentials: 100, growth: 200, premium: 300, internalDiscountCode: 'hidden' },
  tierEssentials: { name: 'Essentials', description: 'Essentials package', deliveryTime: '2 weeks', features: ['Improve site'], internalCost: 4 },
  tierGrowth: { name: 'Growth', description: 'Growth package', deliveryTime: '3 weeks', features: ['Improve ranking'] },
  tierPremium: { name: 'Premium', description: 'Premium package', deliveryTime: '4 weeks', features: ['Improve conversions'] },
  nextSteps: ['Book a review'],
  assumptions: [],
  disclaimers: [],
  qaResults: {
    providerResponse: 'private',
    provenance: {
      proposalInputVersion: 1,
      findingIds: ['finding-internal-id'],
      evidenceIds: ['evidence-1'],
      findingEvidenceIds: { 'finding-internal-id': ['evidence-1'] },
    },
    publicationApproval: { decision: 'APPROVED', proposalVersion: 3 },
    status: 'PASS',
    hardFailures: [],
    evaluation: { passed: true },
    claimPolicy: { valid: true },
    grounding: {
      claims: [
        { claimId: 'finding-claim', claimType: 'DERIVED_FROM_FINDINGS', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'essentials-description', text: 'Essentials package', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'essentials-feature', text: 'Improve site', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'essentials-price', text: 'USD 100', claimType: 'COMMERCIAL_CONFIGURATION', sourceFindingIds: [], configurationRefs: ['proposal-pricing-v1'] },
        { claimId: 'growth-description', text: 'Growth package', claimType: 'RECOMMENDATION', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'growth-feature', text: 'Improve ranking', claimType: 'RECOMMENDATION', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'growth-price', text: 'USD 200', claimType: 'COMMERCIAL_CONFIGURATION', sourceFindingIds: [], configurationRefs: ['proposal-pricing-v1'] },
        { claimId: 'premium-description', text: 'Premium package', claimType: 'RECOMMENDATION', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'premium-feature', text: 'Improve conversions', claimType: 'RECOMMENDATION', sourceFindingIds: ['finding-internal-id'] },
        { claimId: 'premium-price', text: 'USD 300', claimType: 'COMMERCIAL_CONFIGURATION', sourceFindingIds: [], configurationRefs: ['proposal-pricing-v1'] },
      ],
      commercial: { prices: { essentials: 100, growth: 200, premium: 300 } },
      bindings: {
        tiers: {
          essentials: {
            description: 'essentials-description',
            features: ['essentials-feature'],
            price: 'essentials-price',
          },
          growth: {
            description: 'growth-description',
            features: ['growth-feature'],
            price: 'growth-price',
          },
          premium: {
            description: 'premium-description',
            features: ['premium-feature'],
            price: 'premium-price',
          },
        },
      },
    },
  },
  replyReceivedAt: null,
  outcome: null,
  tierChosen: null,
  audit: {
      status: 'COMPLETE',
      trustState: 'TRUSTED',
    evidence: [{
      id: 'evidence-1', module: 'seo', collectedAt: new Date(), source: 'test',
      observationStatus: 'COMPLETE', targetUrl: null, methodVersion: null, rawResponse: {},
    }],
    businessName: 'Example Co',
    businessCity: 'Denver',
    businessIndustry: 'Retail',
    overallScore: 72,
    startedAt: new Date(),
    completedAt: new Date(),
    findings: [
      {
        id: 'finding-internal-id',
        module: 'seo',
        category: 'Search',
        type: 'PAINKILLER',
        title: 'Missing metadata',
        description: 'Metadata is missing',
        impactScore: 8,
        effortEstimate: 'LOW',
        recommendedFix: [{ action: 'Add metadata', providerPayload: 'private' }],
        metrics: { seoScore: 62, providerResponseSize: 900, sourceEvidenceIds: ['evidence-1'] },
        evidence: [{ rawResponse: 'private' }],
        confidenceScore: 99,
      },
    ],
  },
};

const publicationState = {
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
  grounding: proposal.qaResults.grounding,
  provenance: proposal.qaResults.provenance,
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
  evidenceSnapshots: [...proposal.audit.evidence].sort((left, right) => left.id.localeCompare(right.id)),
};
const publicationFingerprint = JSON.stringify(publicationState);
proposal.qaResults.publicationFingerprint = publicationFingerprint;
proposal.qaResults.publicationApproval.fingerprint = publicationFingerprint;
proposal.publicationFingerprint = publicationFingerprint;

describe('public proposal access authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(proposal);
    mocks.assertProposalPublishable.mockImplementation(() => undefined);
  });

  it('resolves an eligible token into a versioned, explicit customer DTO', async () => {
    const result = await resolvePublicProposalAccess('bearer-token');
    expect(result.proposal.version).toBe(3);
    expect(result.proposal.audit.findings[0]).toEqual({
      id: 'finding-1',
      module: 'seo',
      category: 'Search',
      type: 'PAINKILLER',
      title: 'Missing metadata',
      description: 'Metadata is missing',
      impactScore: 8,
      effortEstimate: 'LOW',
      recommendedFix: ['Add metadata'],
      metrics: { seoScore: 62 },
    });
    expect(JSON.stringify(result.proposal)).not.toMatch(/provider|rawResponse|confidence|internalCost|discountCode/i);
    expect(mocks.assertProposalPublishable).toHaveBeenCalledWith(expect.objectContaining({
      auditId: 'audit-1',
      tenantId: 'tenant-1',
      version: 3,
      status: 'SENT',
      qaResults: expect.objectContaining({ publicationFingerprint }),
    }));
  });

  it('rejects rejected and expired proposal links', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...proposal, status: 'REJECTED' });
    await expect(resolvePublicProposalAccess('rejected')).rejects.toMatchObject({ status: 410 });

    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });
    await expect(resolvePublicProposalAccess('expired')).rejects.toMatchObject({ status: 410 });
  });

  it('rejects explicitly revoked proposal links', async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...proposal, publicAccessRevokedAt: new Date() });
    await expect(resolvePublicProposalAccess('revoked')).rejects.toMatchObject({ status: 410 });
  });

  it.each([
    ['incomplete audit', { status: 'PARTIAL', trustState: 'TRUSTED' }],
    ['untrusted audit', { status: 'COMPLETE', trustState: 'DEGRADED_REVIEW_REQUIRED' }],
  ])('rejects an %s', async (_label, auditState) => {
    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      audit: { ...proposal.audit, ...auditState },
    });
    await expect(resolvePublicProposalAccess('untrusted')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects missing or stale persisted evidence provenance', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      audit: { ...proposal.audit, evidence: [] },
    });
    await expect(resolvePublicProposalAccess('missing-evidence')).rejects.toMatchObject({ status: 404 });

    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      qaResults: {
        ...proposal.qaResults,
        provenance: { ...proposal.qaResults.provenance, evidenceIds: ['stale-evidence'] },
      },
    });
    await expect(resolvePublicProposalAccess('stale-evidence')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects stale finding provenance and unbound finding evidence', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      qaResults: {
        ...proposal.qaResults,
        provenance: { ...proposal.qaResults.provenance, findingIds: ['stale-finding'] },
      },
    });
    await expect(resolvePublicProposalAccess('stale-finding')).rejects.toMatchObject({ status: 404 });

    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      audit: {
        ...proposal.audit,
        findings: [{ ...proposal.audit.findings[0], evidence: [] }],
      },
    });
    await expect(resolvePublicProposalAccess('unbound-finding')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects missing claim lineage and foreign claim Finding references', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      qaResults: { ...proposal.qaResults, grounding: { claims: [] } },
    });
    await expect(resolvePublicProposalAccess('missing-claim-lineage')).rejects.toMatchObject({ status: 404 });

    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      qaResults: {
        ...proposal.qaResults,
        grounding: { claims: [{ sourceFindingIds: ['foreign-finding'] }] },
      },
    });
    await expect(resolvePublicProposalAccess('foreign-claim-lineage')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects proposal price, tier, identity, or content mutation after approval', async () => {
    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      pricing: { essentials: 101, growth: 200, premium: 300 },
    });
    await expect(resolvePublicProposalAccess('mutated-price')).rejects.toMatchObject({ status: 404 });

    mocks.findUnique.mockResolvedValueOnce({
      ...proposal,
      executiveSummary: 'Changed after QA',
    });
    await expect(resolvePublicProposalAccess('mutated-summary')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects invalid token and unpublished proposal access', async () => {
    await expect(resolvePublicProposalAccess('')).rejects.toBeInstanceOf(PublicProposalAccessError);
    mocks.assertProposalPublishable.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await expect(resolvePublicProposalAccess('blocked')).rejects.toMatchObject({ status: 404 });
  });

  it('queries only fields needed for the public projection', async () => {
    await resolvePublicProposalAccess('bearer-token');
    const query = mocks.findUnique.mock.calls[0]![0];
    expect(query.where).toEqual({ webLinkToken: 'bearer-token' });
    expect(query.select.audit.select.findings.where).toEqual({ excluded: false });
    expect(query.select.audit.select.findings.select.evidence).toBe(true);
    expect(query.select).not.toHaveProperty('clientScoreResults');
    expect(query.select).not.toHaveProperty('prospectEmail');
  });
});
