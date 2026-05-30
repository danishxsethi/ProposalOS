import { Finding } from '@prisma/client';
import { RunTree } from 'langsmith';

import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { createEvidence } from '@/lib/modules/types';
import type { VerticalPlaybook } from '@/lib/playbooks/types';

import { generateExecutiveSummary } from './executiveSummary';
import { getPricing } from './pricing';
import { calculateTierROI } from './roiCalculator';
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
  tierMapping: TierMapping
): { essentials: TierConfig; growth: TierConfig; premium: TierConfig } {
  const defaultTiers = {
    essentials: {
      name: 'Starter',
      description:
        'Entry point — quick wins only. Speed optimization, basic SEO, and essential fixes. Limited scope, clear constraints.',
      findingIds: tierMapping.essentials,
      deliveryTime: '5 business days',
      price: pricing.essentials,
      recommended: recommendedTier === 'starter',
      features: [
        'Speed optimization (image compression, lazy loading, caching)',
        'Basic SEO fixes (meta tags, sitemap, schema markup)',
        '1 round of revisions',
      ],
    },
    growth: {
      name: 'Growth',
      description:
        'The full transformation — best value. Everything in Starter plus competitive edge. Everything you need to overtake competitors.',
      findingIds: tierMapping.growth,
      deliveryTime: '10 business days',
      price: pricing.growth,
      recommended: recommendedTier === 'growth',
      badge: 'BEST VALUE',
      features: [
        'Everything in Starter',
        'Full SEO overhaul (content optimization, internal linking, local SEO)',
        'Google Business Profile optimization',
        'Conversion optimization (CTAs, forms, click-to-call)',
        'Accessibility fixes (WCAG 2.1 Level A)',
        'Competitor gap analysis report',
        '3 rounds of revisions',
      ],
    },
    premium: {
      name: 'Premium',
      description:
        'Full-service — ongoing partnership. Everything in Growth plus content and monitoring. Premium positioning, custom work.',
      findingIds: tierMapping.premium,
      deliveryTime: '15 business days',
      price: pricing.premium,
      recommended: recommendedTier === 'premium',
      features: [
        'Everything in Growth',
        'Content creation (3 new pages/blog posts, optimized for local SEO)',
        'Monthly performance monitoring (3 months)',
        'Priority support',
        'Quarterly re-audit and progress report',
        'Unlimited revisions',
      ],
    },
  };

  if (segment === 'nonprofit') {
    return {
      essentials: {
        ...defaultTiers.essentials,
        description:
          'Entry point — simple foundation. Optimization, security, and donation-flow accessibility fixes.',
        features: [
          'Donation page speed optimization (image compression, lazy loading)',
          'Basic accessibility fixes (contrast, readable headings)',
          'Secure page-load enhancements for trust and safety',
          '1 round of revisions',
        ],
      },
      growth: {
        ...defaultTiers.growth,
        description:
          'Full community engagement. Donation-rate optimization, sitemap, and outreach mechanics.',
        features: [
          'Everything in Starter',
          'Donation funnel optimization (CTAs, clear contribution paths)',
          'Outreach sitemap & organic donor SEO',
          'Accessibility audit & WCAG 2.1 Level AA compliance check',
          'Integrations setup (donation widgets, newsletter subscriptions)',
          'Community engagement report',
          '3 rounds of revisions',
        ],
      },
      premium: {
        ...defaultTiers.premium,
        description:
          'Full community overhaul & partnership. Campaign trackers, and deep accessibility compliance.',
        features: [
          'Everything in Growth',
          'Comprehensive community campaign setup',
          'Advanced accessible landing pages for fundraising',
          'Ongoing community feedback tracking and reporting (3 months)',
          'Priority technical and campaign support',
          'Quarterly community re-audit and progress report',
          'Unlimited revisions',
        ],
      },
    };
  }

  if (segment === 'technical_community') {
    return {
      essentials: {
        ...defaultTiers.essentials,
        description:
          'Entry point — developer foundation. Speed, performance, and API reference sitemaps.',
        features: [
          'LCP and PageSpeed optimization (caching, fast assets)',
          'Sitemap and schema tags for developer documentation',
          'Core Web Vitals health score setup',
          '1 round of revisions',
        ],
      },
      growth: {
        ...defaultTiers.growth,
        description:
          'Overtake competing projects. Deep developer SEO, docs accessibility, and open-source compliance.',
        features: [
          'Everything in Starter',
          'Developer-focused SEO overhaul (doc search optimization, organic discovery)',
          'Documentation search integration & navigation improvement',
          'Comprehensive WCAG Level AA accessibility auditing',
          'Community contribution funnel optimizations (Contributor guide visibility)',
          'Technical sitemap gap analysis report',
          '3 rounds of revisions',
        ],
      },
      premium: {
        ...defaultTiers.premium,
        description:
          'Global tech-community scale. Content creation, deep developer advocacy, and performance monitoring.',
        features: [
          'Everything in Growth',
          'Technical content pipeline strategy (3 new developer guides)',
          'Custom visual reporting and monthly performance insights (3 months)',
          'Priority developer-focused support',
          'Documentation contribution tracking',
          'Quarterly documentation sitemap re-audit',
          'Unlimited revisions',
        ],
      },
    };
  }

  if (segment === 'healthcare') {
    return {
      essentials: {
        ...defaultTiers.essentials,
        description:
          'Compliance & basic speed. Patient data privacy, simple accessibility, and quick performance fixes.',
        features: [
          'Basic privacy-first page optimization',
          'Basic sitemap and medical schema tags',
          'Core accessibility repairs for patient portals',
          '1 round of revisions',
        ],
      },
      growth: {
        ...defaultTiers.growth,
        description:
          'Patient enrollment & trusted search. Conversion paths, accessibility WCAG compliance, and practice findability.',
        features: [
          'Everything in Starter',
          'High-converting patient appointment CTAs',
          'Complete ADA/WCAG 2.1 Level AA compliance audit',
          'HIPAA-compliant form routing advice',
          'Patient-first navigation and layout improvements',
          'Practice discoverability gap analysis',
          '3 rounds of revisions',
        ],
      },
      premium: {
        ...defaultTiers.premium,
        description:
          'Elite healthcare trust. Multi-channel visibility, specialized page setups, and compliance assurance.',
        features: [
          'Everything in Growth',
          'Patient journey mapping and advanced conversion funnels',
          'Ongoing accessibility monitoring & reports (3 months)',
          'Priority compliance-aligned technical support',
          'Comprehensive practice discovery report',
          'Quarterly healthcare-specific re-audit',
          'Unlimited revisions',
        ],
      },
    };
  }

  if (segment === 'enterprise') {
    return {
      essentials: {
        ...defaultTiers.essentials,
        description:
          'Enterprise-grade basics. Multi-region latency speed-ups, basic security headers, and compliance schema.',
        features: [
          'Multi-region speed and latency analysis',
          'Security headers and basic technical vulnerability fixes',
          'Enterprise search engine schema setup',
          '1 round of revisions',
        ],
      },
      growth: {
        ...defaultTiers.growth,
        description:
          'Scalable lead-gen and B2B growth. High-throughput performance, strict accessibility, and B2B funnel fixes.',
        features: [
          'Everything in Starter',
          'High-throughput load time and PageSpeed optimization',
          'Advanced accessibility compliance (WCAG 2.1 Level AA)',
          'B2B/Enterprise conversion funnel mapping',
          'SEO keyword and competitive landscape report',
          '3 rounds of revisions',
        ],
      },
      premium: {
        ...defaultTiers.premium,
        description:
          'Ultimate partnership. Dedicated support, high-availability monitoring, custom features, and continuous auditing.',
        features: [
          'Everything in Growth',
          'Custom high-availability and architecture review',
          'Dedicated technical account manager',
          'Monthly SEO, performance, and accessibility re-auditing',
          'Unlimited premium revisions and custom work support',
          'Quarterly full architecture sitemap re-audit',
          'Unlimited revisions',
        ],
      },
    };
  }

  return defaultTiers;
}

/** QA-aligned: has pointer+collected_at or type+(value|label) or url/source/raw/string */
function hasValidEvidence(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  if (typeof o.pointer === 'string' && o.pointer.length > 0 && o.collected_at) return true;
  if (o.type && (o.value !== undefined || o.label)) return true;
  return !!(o.url || o.source || o.raw || (typeof e === 'string' && (e as string).length > 0));
}

/**
 * Agency-grade hardening: dedupe by (module, title), clamp impact 1–10,
 * ensure each finding has ≥1 valid evidence, ensure ≥1 PAINKILLER.
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
  for (const f of deduped) {
    (f as { impactScore: number }).impactScore = Math.min(
      10,
      Math.max(1, Number(f.impactScore) || 5)
    );
    const evidence = (f.evidence as unknown[]) ?? [];
    if (!evidence.some(hasValidEvidence)) {
      (f as { evidence: unknown }).evidence = [
        ...evidence,
        createEvidence({
          pointer: 'audit',
          source: 'proposal_normalize',
          type: 'text',
          value: f.title,
          label: f.module,
        }),
      ];
    }
  }
  const painkillers = deduped.filter((f) => f.type === 'PAINKILLER');
  if (painkillers.length === 0 && deduped.length > 0) {
    const byImpact = [...deduped].sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0));
    (byImpact[0] as { type: string }).type = 'PAINKILLER';
  }
  return deduped;
}

function timelineByEffort(effort?: string | null): string {
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

  const multiplier = playbook?.pricingMultiplier ?? 1.0;
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

  const tiers = getCustomizedTiers(segment, pricing, recommendedTier, tierMapping);

  // Calculate ROI for each tier
  // We need to resolve finding objects for the IDs in each tier
  const findingsMap = new Map(normalizedFindings.map((f) => [f.id, f]));

  // Helper to get findings for a tier
  const getTierFindings = (ids: string[]) =>
    ids.map((id) => findingsMap.get(id)).filter((f): f is Finding => !!f);

  const essentialsRoi = calculateTierROI(
    getTierFindings(tiers.essentials.findingIds),
    tiers.essentials.price || 0,
    businessIndustry,
    normalizedFindings
  );
  tiers.essentials.roi = {
    monthlyValue: essentialsRoi.totalMonthlyValue,
    ratio: essentialsRoi.ratio,
    scenarios: {
      best: Math.round(essentialsRoi.totalMonthlyValue * 1.25),
      base: essentialsRoi.totalMonthlyValue,
      worst: Math.round(essentialsRoi.totalMonthlyValue * 0.6),
      assumptions: [
        'Implementation completed as scoped within the tier',
        'Traffic and conversion rates remain within current benchmark range',
        'Performance gains materialize after deployment and indexing cycle',
      ],
    },
  };

  const growthRoi = calculateTierROI(
    getTierFindings(tiers.growth.findingIds),
    tiers.growth.price || 0,
    businessIndustry,
    normalizedFindings
  );
  tiers.growth.roi = {
    monthlyValue: growthRoi.totalMonthlyValue,
    ratio: growthRoi.ratio,
    scenarios: {
      best: Math.round(growthRoi.totalMonthlyValue * 1.25),
      base: growthRoi.totalMonthlyValue,
      worst: Math.round(growthRoi.totalMonthlyValue * 0.6),
      assumptions: [
        'Growth-tier fixes are shipped and measured against baseline',
        'Local search demand remains stable over the quarter',
        'Offer and conversion paths stay consistent during implementation',
      ],
    },
  };

  const premiumRoi = calculateTierROI(
    getTierFindings(tiers.premium.findingIds),
    tiers.premium.price || 0,
    businessIndustry,
    normalizedFindings
  );
  tiers.premium.roi = {
    monthlyValue: premiumRoi.totalMonthlyValue,
    ratio: premiumRoi.ratio,
    scenarios: {
      best: Math.round(premiumRoi.totalMonthlyValue * 1.25),
      base: premiumRoi.totalMonthlyValue,
      worst: Math.round(premiumRoi.totalMonthlyValue * 0.6),
      assumptions: [
        'Premium scope is executed end-to-end with monitoring',
        'Content and technical work are approved without major delays',
        'Competitive dynamics remain similar to current benchmark snapshot',
      ],
    },
  };

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
  const topActionLines = topActions.map(
    (a, i) =>
      `Top Action ${i + 1}: ${a.title} | Impact: ${a.impact}/10 | Effort: ${a.effort} | Timeline: ${a.timeline}`
  );

  // Step 4: Generate executive summary (playbook + comparison influence language)
  const executiveSummary = await generateExecutiveSummary(
    businessName,
    clusters,
    normalizedFindings,
    tracker,
    parentTrace,
    playbook ?? undefined,
    city ?? undefined,
    comparisonReport ?? undefined
  );
  logger.info('[ProposalPipeline] Generated executive summary');

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
    nextSteps: generateNextSteps(topActionLines),
  };

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
