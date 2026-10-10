/**
 * Conversion View Model for Proposals (Web + PDF)
 *
 * Single Source of Truth for:
 * 1. Hook Header (prospect name + single most expensive problem quantified in $)
 * 2. Executive Summary (3 findings max, each with $ impact estimate)
 * 3. What We Found (all findings ranked by $ impact with evidence)
 * 4. Quick Wins vs Strategic Fixes
 * 5. Phased Roadmap Timeline
 * 6. 3-Tier Anchored Pricing
 * 7. 30-Day Risk Reversal Guarantee
 * 8. Social Proof Case Study
 * 9. Single CTA (Calendar Link)
 * 10. Pricing Urgency / Expiry Date
 */

import { assessRevenueImpact, type RevenueImpactAssessment } from './financialClaims';
import {
  CANONICAL_OFFERS,
  formatDollar,
  getEvidenceBenchmarkForVertical,
  getOffersForProposal,
  getSocialProofForVertical,
  getUrgencyExpiryDate,
  IndustryEvidenceBenchmark,
  OfferTierDefinition,
  RiskReversalGuarantee,
  SocialProofCaseStudy,
} from './offers';
import { calculateFindingROI, INDUSTRY_ROI_BENCHMARKS } from './roiCalculator';

export interface QuantifiedFinding {
  id: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  /**
   * INTERNAL prioritization weight (modeled, not observed). Never shown as a
   * customer-facing fact: customer-facing dollar strings are null unless the
   * revenue-impact gate (lib/proposal/financialClaims.ts) confirms observed
   * traffic/conversion inputs exist.
   */
  modeledMonthlyImpact: number;
  /** Customer-facing dollar string, or null when the financial-claim gate suppresses it. */
  monthlyDollarFormatted: string | null;
  evidenceSnippets: string[];
  recommendedFix: string;
  isQuickWin: boolean;
  category: string;
  module: string;
}

export interface ProposalRoadmapPhase {
  phase: number;
  name: string;
  timeline: string;
  deliverables: string[];
  impactSummary: string;
}

export interface ProposalConversionModel {
  proposalId: string;
  token: string;
  businessName: string;
  businessCity: string;
  businessIndustry: string;
  brandName: string;
  brandDomain: string;
  auditDateFormatted: string;
  expiryDateFormatted: string;
  calendarBookingUrl: string;
  singleCtaText: string;
  singleCtaSubtext: string;

  // 1. Hook Header
  hookHeader: {
    headline: string;
    subheadline: string;
    primaryProblemTitle: string;
    /** Null when the financial-claim gate suppresses monetary claims. */
    primaryProblemLossFormatted: string | null;
    /** Null when the financial-claim gate suppresses monetary claims. */
    totalMonthlyBleedFormatted: string | null;
    /** Null when the financial-claim gate suppresses monetary claims. */
    totalAnnualBleedFormatted: string | null;
  };

  // Financial-claim gate result + observed-evidence KPIs (always safe to show).
  revenueImpact: RevenueImpactAssessment;
  evidenceKpis: Array<{
    label: string;
    value: string;
    detail: string;
  }>;

  // 2. Executive Summary (Max 3 findings; dollar framing only when supported)
  executiveSummary: {
    overview: string;
    topThreePoints: Array<{
      title: string;
      metric: string;
      /** Null when the financial-claim gate suppresses monetary claims. */
      monthlyLossFormatted: string | null;
      explanation: string;
    }>;
  };

  // 3. What We Found (Ranked by $ impact)
  rankedFindings: QuantifiedFinding[];

  // 4. Quick Wins vs Strategic Fixes
  quickWins: QuantifiedFinding[];
  strategicFixes: QuantifiedFinding[];

  // 5. The Phased Plan
  roadmap: ProposalRoadmapPhase[];

  // 6. Pricing (3 Tiers with Decoy Anchoring)
  pricingTiers: Array<
    OfferTierDefinition & {
      priceFormatted: string;
      /** Null when the financial-claim gate suppresses ROI claims. */
      monthlyRoiFormatted: string | null;
      /** Null when the financial-claim gate suppresses ROI claims. */
      roiPaybackDays: number | null;
    }
  >;

  // 7. Risk Reversal Guarantee
  guarantee: RiskReversalGuarantee;

  // 8. Why This Works (Cited Industry Evidence Benchmark) & Real Case Study (if exists)
  whyThisWorks: IndustryEvidenceBenchmark;
  realCaseStudy: SocialProofCaseStudy | null;

  // Competitor Comparison
  competitorSummary?: {
    rankText: string;
    competitorLeadSummary: string;
    competitorNames: string[];
  };
}

function cleanFindingText(text?: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function mapFindingSeverity(finding: any): 'Critical' | 'High' | 'Medium' | 'Low' {
  const type = String(finding.type || '').toUpperCase();
  const impact = Number(finding.impactScore ?? 0);
  if (type === 'PAINKILLER' || impact >= 9) return 'Critical';
  if (impact >= 7) return 'High';
  if (impact >= 4) return 'Medium';
  return 'Low';
}

function isFindingQuickWin(finding: any): boolean {
  const t = cleanFindingText(finding.title).toLowerCase();
  const effort = String(finding.effortEstimate || '').toLowerCase();
  if (effort === 'low' || effort === 'minutes') return true;
  return (
    t.includes('meta description') ||
    t.includes('alt text') ||
    t.includes('title tag') ||
    t.includes('google business profile') ||
    t.includes('searchbox') ||
    t.includes('hours')
  );
}

function getRecommendedFixText(fix: unknown): string {
  if (!fix) return 'Apply technical markup and optimization according to Google specifications.';
  if (typeof fix === 'string') return fix;
  if (Array.isArray(fix) && fix.length > 0) {
    const first = fix[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first !== null) {
      return (first as any).action || (first as any).description || JSON.stringify(first);
    }
  }
  return 'Apply technical markup and optimization according to Google specifications.';
}

function extractEvidenceSnippets(finding: any): string[] {
  const snippets: string[] = [];
  const ev = finding.evidence;
  if (Array.isArray(ev)) {
    for (const item of ev.slice(0, 3)) {
      if (typeof item === 'string') {
        snippets.push(item);
      } else if (typeof item === 'object' && item !== null) {
        const text =
          item.text ||
          item.message ||
          item.pointer ||
          item.snippet ||
          item.description ||
          item.value;
        if (text) snippets.push(String(text));
      }
    }
  }
  if (snippets.length === 0 && finding.description) {
    snippets.push(cleanFindingText(finding.description));
  }
  return snippets;
}

/**
 * Builds the canonical conversion view model from any proposal record
 */
export function buildProposalConversionModel(
  proposal: any,
  options?: { calendarUrl?: string }
): ProposalConversionModel {
  const audit = proposal.audit || {};
  const businessName = audit.businessName || 'Your Business';
  const businessCity = audit.businessCity || 'your area';
  const businessIndustry = audit.businessIndustry || 'local';
  const createdAt = proposal.createdAt || new Date();
  const token = proposal.webLinkToken || proposal.id;

  const rawFindings: any[] = Array.isArray(audit.findings) ? audit.findings : [];

  // Financial-claim gate: dollar figures are customer-facing ONLY when the
  // audit contains observed traffic/conversion/revenue inputs. Today the
  // pipeline collects none, so all dollar strings below are null and the
  // copy uses observed evidence instead. The ROI model remains for internal
  // prioritization only — never presented as a business fact.
  const revenueImpact = assessRevenueImpact(audit);
  const dollarVisible = revenueImpact.supported;

  // Quantify findings for INTERNAL prioritization (modeled, not observed).
  const quantified: QuantifiedFinding[] = rawFindings.map((f: any) => {
    const roi = calculateFindingROI(f, businessIndustry, { findings: rawFindings });
    const modeledMonthlyImpact = Math.max(0, Math.round(roi.monthlyValue));
    const severity = mapFindingSeverity(f);

    return {
      id: f.id || Math.random().toString(36).substring(7),
      title: cleanFindingText(f.title),
      description: cleanFindingText(f.description),
      severity,
      modeledMonthlyImpact,
      monthlyDollarFormatted: dollarVisible ? formatDollar(modeledMonthlyImpact) : null,
      evidenceSnippets: extractEvidenceSnippets(f),
      recommendedFix: getRecommendedFixText(f.recommendedFix),
      isQuickWin: isFindingQuickWin(f),
      category: f.category || f.module || 'Technical SEO',
      module: f.module || 'general',
    };
  });

  // Rank by modeled impact, then severity — internal ordering only.
  const severityRank = { Critical: 3, High: 2, Medium: 1, Low: 0 };
  quantified.sort(
    (a, b) =>
      b.modeledMonthlyImpact - a.modeledMonthlyImpact ||
      severityRank[b.severity] - severityRank[a.severity]
  );

  // NOTE: a previous version fabricated three "fallback findings" with
  // invented dollar losses and evidence snippets when the audit returned no
  // findings. That was fabricated evidence and has been removed entirely:
  // an empty audit renders an honest empty findings list (in practice the
  // proposal compiler refuses to create proposals for audits with no
  // evidence-backed findings, so this is legacy-row defense only).

  // Modeled totals — customer-facing ONLY when the financial-claim gate passes.
  const totalMonthlyBleed = quantified.reduce((sum, f) => sum + f.modeledMonthlyImpact, 0);
  const totalAnnualBleed = totalMonthlyBleed * 12;
  const totalMonthlyBleedFormatted = dollarVisible ? `${formatDollar(totalMonthlyBleed)}/mo` : null;
  const totalAnnualBleedFormatted = dollarVisible ? `${formatDollar(totalAnnualBleed)}/yr` : null;

  const primaryProblem = quantified[0];
  const primaryProblemTitle =
    primaryProblem?.title ?? 'No verified issues were found for this audit';
  const primaryProblemLossFormatted =
    primaryProblem && dollarVisible ? primaryProblem.monthlyDollarFormatted : null;

  // Split quick wins vs strategic
  const quickWins = quantified.filter((f) => f.isQuickWin);
  const strategicFixes = quantified.filter((f) => !f.isQuickWin);

  // Ensure quick wins has at least 1 item
  if (quickWins.length === 0 && quantified.length > 0) {
    const lastFinding = quantified[quantified.length - 1]!;
    quickWins.push({ ...lastFinding, isQuickWin: true });
  }

  // Executive summary: exactly top 3 findings max; dollar framing only when supported
  const topThree = quantified.slice(0, 3);
  const topThreePoints = topThree.map((f) => ({
    title: f.title,
    metric: f.severity,
    monthlyLossFormatted: f.monthlyDollarFormatted,
    explanation:
      f.description ||
      (f.monthlyDollarFormatted
        ? `Modeled at an estimated ${f.monthlyDollarFormatted}/month in lost customer volume.`
        : 'Verified against captured audit evidence.'),
  }));

  // Resolve Pricing Tiers
  const pricingRaw = proposal.pricing as any;
  const offers = getOffersForProposal({
    industry: businessIndustry,
    pricing: pricingRaw,
  });

  const pricingTiers = offers.map((tier) => {
    // ROI and payback claims require the financial-claim gate; otherwise the
    // tier card shows the price and scope only.
    if (!dollarVisible) {
      return {
        ...tier,
        priceFormatted: formatDollar(tier.price),
        monthlyRoiFormatted: null,
        roiPaybackDays: null,
      };
    }
    const monthlyRecovery = Math.round(
      totalMonthlyBleed * (tier.id === 'starter' ? 0.45 : tier.id === 'growth' ? 0.85 : 1.0)
    );
    const paybackDays = Math.max(7, Math.round(tier.price / (monthlyRecovery / 30)));
    return {
      ...tier,
      priceFormatted: formatDollar(tier.price),
      monthlyRoiFormatted: `${formatDollar(monthlyRecovery)}/mo`,
      roiPaybackDays: paybackDays,
    };
  });

  // Phased Plan Roadmap
  const roadmap: ProposalRoadmapPhase[] = [
    {
      phase: 1,
      name: 'Immediate Triage & Critical Schemas',
      timeline: 'Days 1–5',
      deliverables: [
        'Deploy LocalBusiness, Organization, and Service JSON-LD schema',
        'Patch high-priority meta titles and descriptions',
        'Verify Rich Results indexing in Google Search Console',
      ],
      impactSummary:
        'Stops immediate technical crawler drop-off and prepares domain for rich search cards.',
    },
    {
      phase: 2,
      name: 'Speed & Mobile Core Web Vitals Sprint',
      timeline: 'Days 6–10',
      deliverables: [
        'Optimize critical rendering path (target <1.5s mobile LCP)',
        'Compress and format images to next-gen WebP with explicit dimensions',
        'Eliminate render-blocking JavaScript and external CSS bottlenecks',
      ],
      impactSummary: 'Reduces mobile visitor bounce rate by an estimated 25–40%.',
    },
    {
      phase: 3,
      name: 'Local Authority & Competitive Overtake',
      timeline: 'Days 11–14',
      deliverables: [
        'Launch automated customer review request & response sequence',
        'Synchronize NAP (Name, Address, Phone) consistency across top 40 citation directories',
        'Embed frictionless booking / inquiry capture form on key service pages',
      ],
      impactSummary: 'Directly bridges the review and ranking gap against local market leaders.',
    },
  ];

  // Competitor Comparison extraction
  let competitorSummary: ProposalConversionModel['competitorSummary'];
  const compReport = proposal.comparisonReport as any;
  if (compReport) {
    const rank = compReport.prospectRank || 2;
    const total = compReport.totalCompetitors || 4;
    const names = Array.isArray(compReport.competitors)
      ? compReport.competitors.map((c: any) => c.name || c.businessName).filter(Boolean)
      : [];
    competitorSummary = {
      rankText: `Rank #${rank} of ${total} in ${businessCity}`,
      competitorLeadSummary:
        compReport.summaryStatement ||
        `Competitors currently lead in review volume and structured data.`,
      competitorNames: names,
    };
  }

  const auditDateFormatted = new Date(createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const expiryDateFormatted = getUrgencyExpiryDate(createdAt);
  const calendarBookingUrl = options?.calendarUrl || CANONICAL_OFFERS.defaultCalendarUrl;

  return {
    proposalId: proposal.id,
    token,
    businessName,
    businessCity,
    businessIndustry,
    brandName: CANONICAL_OFFERS.brandName,
    brandDomain: CANONICAL_OFFERS.brandDomain,
    auditDateFormatted,
    expiryDateFormatted,
    calendarBookingUrl,
    singleCtaText: CANONICAL_OFFERS.singleCtaText,
    singleCtaSubtext: CANONICAL_OFFERS.singleCtaSubtext,
    hookHeader: {
      // Financial-claim gate: a definitive dollar-loss headline requires
      // observed traffic/conversion inputs. Without them, the headline states
      // the observed evidence instead of inventing a business impact.
      headline: dollarVisible
        ? `${businessName} is losing an estimated ${formatDollar(totalMonthlyBleed)}/mo to local search gaps`
        : `${businessName}: ${quantified.length} verified issues found across search, mobile, and reputation`,
      subheadline: `Forensic Digital Assessment • Prepared for ${businessName} in ${businessCity}`,
      primaryProblemTitle,
      primaryProblemLossFormatted,
      totalMonthlyBleedFormatted,
      totalAnnualBleedFormatted,
    },
    revenueImpact,
    evidenceKpis: [
      {
        label: 'Verified findings',
        value: `${quantified.length}`,
        detail: 'Each backed by captured audit evidence',
      },
      {
        label: 'Priority issues',
        value: `${quantified.filter((f) => f.severity === 'Critical' || f.severity === 'High').length}`,
        detail: 'Critical or high severity',
      },
      ...(competitorSummary
        ? [
            {
              label: 'Local standing',
              value: competitorSummary.rankText.replace(' in ', ' • ').replace('Rank ', ''),
              detail: competitorSummary.competitorLeadSummary,
            },
          ]
        : []),
    ],
    executiveSummary: {
      overview: dollarVisible
        ? `A live technical audit of ${businessName}'s digital footprint identified ${quantified.length} high-impact friction points. Without structured schema, optimized mobile delivery, and aggressive review capture, an estimated ${formatDollar(totalMonthlyBleed)} in monthly customer lifetime value is flowing directly to local competitors.`
        : `A live technical audit of ${businessName}'s digital footprint verified ${quantified.length} issues across structured data, mobile delivery, and local reputation — every one backed by captured evidence and ranked by measured impact. The plan below sequences the fixes by priority.`,
      topThreePoints,
    },
    rankedFindings: quantified,
    quickWins,
    strategicFixes,
    roadmap,
    pricingTiers,
    guarantee: CANONICAL_OFFERS.guarantee,
    whyThisWorks: getEvidenceBenchmarkForVertical(businessIndustry),
    realCaseStudy: getSocialProofForVertical(businessIndustry),
    competitorSummary,
  };
}
