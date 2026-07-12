import { Finding } from '@prisma/client';
import { RunTree } from 'langsmith';
import { z } from 'zod';

import { validateFinding } from '@/lib/audit/findingContract';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import type { VerticalPlaybook } from '@/lib/playbooks/types';

import { buildProposalGrounding } from './grounding';
import { getPricing } from './pricing';
import { mapToTiers } from './tierMapping';
import { OrganizationSegment, ProposalResult, TierConfig, TierMapping } from './types';
import {
  generateAssumptions,
  generateDisclaimers,
  generateNextSteps,
  validateCitations,
} from './validation';
import { PainCluster } from '../diagnosis/types';
export type {
  ProposalResult,
  TierConfig,
  ComparisonReport,
  OrganizationSegment,
  TierMapping,
} from './types';

/**
 * Infer organization segment based on website URL, business name, and industry.
 */
export function inferOrganizationSegment(
  url?: string | null,
  name?: string | null,
  industry?: string | null
): OrganizationSegment {
  const cleanUrl = (url || '').toLowerCase().trim();
  const cleanName = (name || '').toLowerCase().trim();
  const cleanIndustry = (industry || '').toLowerCase().trim();

  // 1. Healthcare check
  const healthcareTerms = [
    'healthcare',
    'medical',
    'clinic',
    'hospital',
    'dental',
    'dentist',
    'doctor',
    'health',
    'practice',
    'physician',
    'nursing',
  ];
  if (
    healthcareTerms.some((term) => cleanIndustry.includes(term)) ||
    healthcareTerms.some((term) => cleanName.includes(term)) ||
    healthcareTerms.some((term) => cleanUrl.includes(term))
  ) {
    return 'healthcare';
  }

  // 2. Technical Community check
  const techTerms = [
    'technical_community',
    'tech community',
    'developer',
    'open source',
    'open-source',
    'software community',
    'software foundation',
    'coding',
    'programming',
    'linux',
    'python',
    'postgresql',
    'github',
    'gitlab',
    'npm',
    'apache',
  ];
  if (
    techTerms.some((term) => cleanIndustry.includes(term)) ||
    techTerms.some((term) => cleanName.includes(term)) ||
    techTerms.some((term) => cleanUrl.includes(term))
  ) {
    return 'technical_community';
  }

  // 3. Nonprofit check
  const nonprofitTerms = [
    'nonprofit',
    'non-profit',
    'charity',
    'ngo',
    'foundation',
    'association',
    'public service',
    'gnu',
  ];
  if (
    nonprofitTerms.some((term) => cleanIndustry.includes(term)) ||
    nonprofitTerms.some((term) => cleanName.includes(term)) ||
    nonprofitTerms.some((term) => cleanUrl.includes(term)) ||
    cleanUrl.endsWith('.org') ||
    cleanUrl.includes('.org/')
  ) {
    return 'nonprofit';
  }

  // 4. Enterprise check
  const enterpriseTerms = ['enterprise', 'corporation', 'corp', 'global', 'saas', 'b2b'];
  if (
    enterpriseTerms.some((term) => cleanIndustry.includes(term)) ||
    enterpriseTerms.some((term) => cleanName.includes(term)) ||
    enterpriseTerms.some((term) => cleanUrl.includes(term))
  ) {
    return 'enterprise';
  }

  // 5. SMB Local check
  const smbTerms = [
    'restaurant',
    'local',
    'smb',
    'retail',
    'salon',
    'contractor',
    'plumber',
    'cleaning',
    'cafe',
    'boutique',
    'shop',
    'bakery',
    'store',
    'dry cleaner',
  ];
  if (
    smbTerms.some((term) => cleanIndustry.includes(term)) ||
    smbTerms.some((term) => cleanName.includes(term)) ||
    smbTerms.some((term) => cleanUrl.includes(term))
  ) {
    return 'smb_local';
  }

  // 6. Fallback
  if (cleanUrl.includes('example.com') || cleanUrl.includes('test.com') || !cleanUrl) {
    return 'baseline_unknown';
  }

  return 'smb_local';
}

export function getCustomizedTiers(
  segment: OrganizationSegment,
  pricing: { essentials: number; growth: number; premium: number },
  recommendedTier: 'starter' | 'growth' | 'premium',
  tierMapping: TierMapping,
  findings: Finding[] = []
): { essentials: TierConfig; growth: TierConfig; premium: TierConfig } {
  void segment;
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const featureFor = (id: string) => {
    const finding = byId.get(id);
    if (!finding) return null;
    const recommended = Array.isArray(finding.recommendedFix)
      ? finding.recommendedFix.find(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : typeof finding.recommendedFix === 'string'
        ? finding.recommendedFix
        : null;
    return recommended || `Address: ${finding.title}`;
  };
  const makeTier = (
    name: string,
    ids: string[],
    price: number,
    deliveryTime: string,
    recommended: boolean,
    badge?: string
  ): TierConfig => {
    const uniqueIds = [...new Set(ids)].sort();
    const features = uniqueIds.map(featureFor).filter((feature): feature is string => !!feature);
    const titles = uniqueIds
      .map((id) => byId.get(id)?.title)
      .filter((title): title is string => !!title);
    return {
      name,
      description:
        titles.length > 0 ? `Addresses: ${titles.join('; ')}` : 'No validated findings assigned.',
      findingIds: uniqueIds,
      deliveryTime,
      price,
      recommended,
      features,
      badge,
    };
  };

  return {
    essentials: makeTier(
      'Starter',
      tierMapping.essentials,
      pricing.essentials,
      '5 business days',
      recommendedTier === 'starter'
    ),
    growth: makeTier(
      'Growth',
      tierMapping.growth,
      pricing.growth,
      '10 business days',
      recommendedTier === 'growth',
      'BEST VALUE'
    ),
    premium: makeTier(
      'Premium',
      tierMapping.premium,
      pricing.premium,
      '15 business days',
      recommendedTier === 'premium'
    ),
  };
}

/**
 * Deduplicate proposal inputs and retain only Findings that pass the canonical Wave 3
 * contract. This boundary never repairs Evidence, severity, or Finding type.
 */
function normalizeFindingsForProposal(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduped: Finding[] = [];
  for (const f of findings) {
    const key = `${f.module}:${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  return deduped.filter((finding) => validateFinding(finding).success);
}

export function timelineByEffort(effort?: string | null): string {
  const e = (effort || 'MEDIUM').toUpperCase();
  if (e === 'LOW') return '7 days';
  if (e === 'HIGH') return '30-45 days';
  return '14-21 days';
}

export function recommendTier(findings: Finding[]): 'starter' | 'growth' | 'premium' {
  const enrichedFindings = findings.map((finding) => {
    const severity = ((finding as unknown as { severity?: string }).severity || '').toLowerCase();
    if (severity) return severity;
    if (finding.impactScore >= 9) return 'critical';
    if (finding.impactScore >= 7) return 'high';
    return 'medium';
  });

  const p0Count = enrichedFindings.filter((severity) => severity === 'critical').length;
  const p1Count = enrichedFindings.filter((severity) => severity === 'high').length;
  const totalFindings = findings.length;
  const modulesCovered = new Set(findings.map((finding) => finding.module)).size;

  if (p0Count >= 3 || totalFindings > 25 || modulesCovered >= 15) return 'premium';
  if (p0Count >= 1 || p1Count >= 5 || totalFindings > 12) return 'growth';
  return 'starter';
}

/**
 * Main proposal generation pipeline
 * @param playbook Optional vertical playbook — influences pricing, recommended tier, and proposal language
 */
export async function runProposalPipeline(
  businessName: string,
  businessIndustry: string | undefined,
  clusters: PainCluster[],
  findings: Finding[],
  tracker?: CostTracker,
  parentTrace?: RunTree,
  playbook?: VerticalPlaybook | null,
  comparisonReport?: import('./types').ComparisonReport | null,
  city?: string | null,
  businessUrl?: string | null
): Promise<ProposalPipelineResult> {
  const segment = inferOrganizationSegment(businessUrl, businessName, businessIndustry);
  logger.info(
    { businessName, vertical: playbook?.id, segment },
    '[ProposalPipeline] Generating proposal'
  );

  const normalizedFindings = normalizeFindingsForProposal([...findings]);

  // Step 1: Map to tiers
  const tierMapping = mapToTiers(clusters, normalizedFindings);
  logger.info('[ProposalPipeline] Mapped findings to tiers');

  // Helper: Determine business size from findings
  // We look for review count metrics, usually in reputation findings
  let detectedBusinessSize: 'small' | 'medium' | 'large' | 'unknown' = 'unknown';
  let maxReviewCount = 0;

  for (const f of normalizedFindings) {
    if (
      f.metrics &&
      typeof f.metrics === 'object' &&
      !Array.isArray(f.metrics) &&
      'reviewCount' in f.metrics
    ) {
      maxReviewCount = Math.max(maxReviewCount, Number((f.metrics as any).reviewCount));
    }
  }

  // Fallback comparison report check if metrics missing from findings directly
  if (
    comparisonReport &&
    comparisonReport.prospect &&
    typeof comparisonReport.prospect === 'object' &&
    'reviewCount' in comparisonReport.prospect
  ) {
    maxReviewCount = Math.max(maxReviewCount, Number(comparisonReport.prospect.reviewCount) || 0);
  }

  if (maxReviewCount > 0) {
    if (maxReviewCount < 50) {
      detectedBusinessSize = 'small';
    } else if (maxReviewCount <= 200) {
      detectedBusinessSize = 'medium';
    } else {
      detectedBusinessSize = 'large';
    }
  }
  logger.info(
    { detectedBusinessSize, maxReviewCount },
    '[ProposalPipeline] Detected business size'
  );

  // Step 2: Get pricing (apply playbook multiplier if present)
  const industryPricing = getPricing({
    industry: businessIndustry || null,
    businessSize: detectedBusinessSize as any,
    location: city || undefined,
    segment,
  } as any);

  const multiplier = z
    .number()
    .finite()
    .min(0.5)
    .max(2)
    .parse(playbook?.pricingMultiplier ?? 1);
  const pricing = {
    essentials: Math.round(industryPricing.essentials * multiplier),
    growth: Math.round(industryPricing.growth * multiplier),
    premium: Math.round(industryPricing.premium * multiplier),
    currency: 'USD',
  };
  logger.info(
    {
      essentials: pricing.essentials,
      growth: pricing.growth,
      premium: pricing.premium,
      multiplier,
    },
    '[ProposalPipeline] Pricing set'
  );

  // Step 3: Create tier configs (Starter / Growth / Premium)
  // Starter: entry point, limited scope. Growth: OBVIOUS BEST VALUE (anchoring). Premium: full-service, premium positioning.
  const inferredRecommendedTier = recommendTier(normalizedFindings);
  const recommendedTier = (playbook?.recommendedTier ?? inferredRecommendedTier) as
    | 'starter'
    | 'growth'
    | 'premium';

  const tiers = getCustomizedTiers(
    segment,
    pricing,
    recommendedTier,
    tierMapping,
    normalizedFindings
  );

  // Top 3 decision-driving actions (impact + effort + timeline)
  const topActions = [...normalizedFindings]
    .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
    .slice(0, 3)
    .map((f) => ({
      findingId: f.id,
      title: f.title,
      impact: f.impactScore,
      effort: (f.effortEstimate || 'MEDIUM').toUpperCase(),
      timeline: timelineByEffort(f.effortEstimate),
    }));
  const executiveSummary = `${businessName}: Validated audit findings include: ${normalizedFindings
    .slice(0, 5)
    .map((finding) => finding.title)
    .join('; ')}. Review the cited Finding evidence before selecting implementation scope.`;

  // Step 5: Build proposal
  const proposal: ProposalResult = {
    executiveSummary,
    painClusters: clusters,
    comparisonReport: comparisonReport ?? undefined,
    topActions,
    tiers,
    pricing,
    assumptions: generateAssumptions(businessName),
    disclaimers: generateDisclaimers(),
    nextSteps: generateNextSteps([]),
  };
  proposal.grounding = buildProposalGrounding(
    proposal,
    {
      auditId: normalizedFindings[0]!.auditId,
      tenantId: normalizedFindings[0]!.tenantId,
      findings: normalizedFindings,
    },
    normalizedFindings.map((finding) => finding.id)
  );

  // Step 6: Validate citations
  const validation = validateCitations(proposal, normalizedFindings);
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, '[ProposalPipeline] Citation validation failed');
    throw new Error(`Citation validation failed: ${validation.errors.join(', ')}`);
  }

  logger.info('[ProposalPipeline] Proposal generated successfully');
  return { ...proposal, normalizedFindings };
}

export type ProposalPipelineResult = ProposalResult & { normalizedFindings: Finding[] };
