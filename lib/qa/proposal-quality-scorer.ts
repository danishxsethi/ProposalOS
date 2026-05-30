/**
 * Proposal Quality Scorer
 *
 * Purpose: Score proposals on clarity, specificity, actionability, persuasiveness, visual quality, personalization
 * Acceptance Criteria: ≥8/10 average across 50+ audits
 */

import { logger } from '@/lib/logger';
import { inferOrganizationSegment } from '@/lib/proposal';
import { FindingRuntime } from '@/lib/proposal/schemas';
import { ProposalResult } from '@/lib/proposal/types';

export interface ProposalQualityScore {
  auditId: string;
  clarity: number;
  specificity: number;
  actionability: number;
  persuasiveness: number;
  visualQuality: number;
  personalization: number;
  overall: number;
  passed: boolean;
  breakdown: QualityBreakdown;
}

export interface QualityBreakdown {
  clarity: ClarityMetrics;
  specificity: SpecificityMetrics;
  actionability: ActionabilityMetrics;
  persuasiveness: PersuasivenessMetrics;
  visualQuality: VisualMetrics;
  personalization: PersonalizationMetrics;
}

export interface ClarityMetrics {
  executiveSummaryLength: number;
  readingLevel: number;
  jargonCount: number;
  sentenceComplexity: number;
  score: number;
}

export interface SpecificityMetrics {
  businessNameMentions: number;
  industrySpecificTerms: number;
  numericSpecificity: number;
  concreteRecommendations: number;
  score: number;
}

export interface ActionabilityMetrics {
  lowEffortFindings: number;
  specificSteps: number;
  timelineClarity: number;
  ownershipClarity: number;
  score: number;
}

export interface PersuasivenessMetrics {
  painPointAlignment: number;
  roiPresence: number;
  urgencyLanguage: number;
  socialProof: number;
  score: number;
}

export interface VisualMetrics {
  visualEvidenceCount: number;
  screenshotAnnotations: number;
  tierVisualQuality: number;
  score: number;
}

export interface PersonalizationMetrics {
  businessNameInSummary: boolean;
  industryContext: boolean;
  cityMentioned: boolean;
  competitorNamed: boolean;
  customRecommendations: number;
  score: number;
}

/**
 * Industry-specific terms for scoring
 */
const INDUSTRY_TERMS: Record<string, string[]> = {
  legal: ['attorney', 'lawyer', 'legal', 'law firm', 'case', 'consultation', 'practice area'],
  dental: ['dentist', 'dental', 'orthodontist', 'teeth', 'cleaning', 'root canal', 'implant'],
  medical: ['doctor', 'physician', 'clinic', 'hospital', 'patient', 'treatment', 'healthcare'],
  construction: ['construction', 'builder', 'contractor', 'renovation', 'remodel', 'build'],
  plumbing: ['plumber', 'plumbing', 'pipe', 'drain', 'water heater', 'leak', 'repair'],
  hvac: ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace', 'ac repair'],
  real_estate: ['real estate', 'realtor', 'property', 'home', 'house', 'listing', 'sale'],
  roofing: ['roof', 'roofing', 'shingle', 'leak', 'roof repair', 'roof replacement'],
  general: ['business', 'service', 'customer', 'product', 'company'],
};

/**
 * Jargon words to penalize
 */
const JARGON_WORDS = [
  'leverage',
  'synergy',
  'paradigm',
  'disrupt',
  'optimize',
  'scalable',
  'robust',
  'seamless',
  'holistic',
  'strategic',
  'best-in-class',
  'cutting-edge',
  'world-class',
  'game-changing',
  'mission-critical',
];

/**
 * Calculate clarity score
 */
function calculateClarity(proposal: ProposalResult): ClarityMetrics {
  const summary = proposal.executiveSummary || '';

  // Length score (ideal: 100-300 characters)
  const lengthScore =
    summary.length >= 50 && summary.length <= 500
      ? 1
      : Math.max(0, 1 - Math.abs(summary.length - 275) / 275);

  // Jargon count
  const jargonCount = JARGON_WORDS.filter((word) => summary.toLowerCase().includes(word)).length;
  const jargonScore = Math.max(0, 1 - jargonCount / 5);

  // Simple sentence complexity (avg words per sentence)
  const sentences = summary.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgWordsPerSentence =
    sentences.length > 0
      ? sentences.reduce((acc, s) => acc + s.split(/\s+/).length, 0) / sentences.length
      : 0;
  const complexityScore =
    avgWordsPerSentence <= 25 ? 1 : Math.max(0, 1 - (avgWordsPerSentence - 25) / 25);

  return {
    executiveSummaryLength: summary.length,
    readingLevel: avgWordsPerSentence,
    jargonCount,
    sentenceComplexity: avgWordsPerSentence,
    score: (lengthScore + jargonScore + complexityScore) / 3,
  };
}

/**
 * Calculate specificity score
 */
function calculateSpecificity(
  proposal: ProposalResult,
  businessName?: string,
  industry?: string
): SpecificityMetrics {
  const fullText = JSON.stringify(proposal).toLowerCase();
  const businessNameLower = (businessName || '').toLowerCase();

  // Business name mentions
  const businessNameMentions = businessNameLower
    ? (
        fullText.match(new RegExp(businessNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ||
        []
      ).length
    : 0;

  // Industry-specific terms
  const industryTerms = industry
    ? INDUSTRY_TERMS[industry] || INDUSTRY_TERMS.general
    : INDUSTRY_TERMS.general;
  const industryTermCount = (industryTerms || []).filter((term) =>
    fullText.includes(term.toLowerCase())
  ).length;

  // Numeric specificity (numbers in proposal)
  const numbers = fullText.match(/\d+/g) || [];
  const numericScore = Math.min(1, numbers.length / 10);

  // Concrete recommendations
  const tierFindings = Object.values(proposal.tiers || {}).flatMap((tier) => tier.findingIds || []);
  const concreteScore = Math.min(1, tierFindings.length / 5);

  return {
    businessNameMentions,
    industrySpecificTerms: industryTermCount,
    numericSpecificity: numbers.length,
    concreteRecommendations: tierFindings.length,
    score:
      ((businessNameMentions > 0 ? 1 : 0) +
        Math.min(1, industryTermCount / 3) +
        numericScore +
        concreteScore) /
      4,
  };
}

/**
 * Calculate actionability score
 */
function calculateActionability(
  proposal: ProposalResult,
  findings: FindingRuntime[]
): ActionabilityMetrics {
  const lowEffortFindings = findings.filter((f) => f.effortEstimate === 'LOW').length;
  const mediumEffortFindings = findings.filter((f) => f.effortEstimate === 'MEDIUM').length;

  // Count specific steps in recommendations
  let totalSteps = 0;
  for (const tier of Object.values(proposal.tiers || {})) {
    const tierText = JSON.stringify(tier).toLowerCase();
    const steps = tierText.match(/\b(first|then|next|finally|step \d+|1\.|2\.|3\.)\b/g) || [];
    totalSteps += steps.length;
  }

  // Timeline clarity
  const hasTimeline = Object.values(proposal.tiers || {}).some((tier) => tier.deliveryTime);

  // Ownership clarity (who does what)
  const fullText = JSON.stringify(proposal).toLowerCase();
  const hasOwnership = ['we will', 'our team', 'you will', 'your team', "we'll", "you'll"].some(
    (phrase) => fullText.includes(phrase)
  );

  return {
    lowEffortFindings: lowEffortFindings + mediumEffortFindings,
    specificSteps: totalSteps,
    timelineClarity: hasTimeline ? 1 : 0,
    ownershipClarity: hasOwnership ? 1 : 0,
    score:
      (Math.min(1, (lowEffortFindings + mediumEffortFindings) / 3) +
        Math.min(1, totalSteps / 5) +
        (hasTimeline ? 1 : 0) +
        (hasOwnership ? 1 : 0)) /
      4,
  };
}

/**
 * Calculate persuasiveness score
 */
function calculatePersuasiveness(
  proposal: ProposalResult,
  findings: FindingRuntime[]
): PersuasivenessMetrics {
  const fullText = JSON.stringify(proposal).toLowerCase();

  // Note: type field removed from FindingRuntime - using impactScore as proxy for pain severity
  // Pain point alignment (high-impact findings referenced)
  const highImpactFindings = findings.filter((f) => f.impactScore >= 8).length;
  const highImpactReferenced = Object.values(proposal.tiers || {}).some((tier) =>
    tier.findingIds?.some((id: string) => findings.find((f) => f.id === id && f.impactScore >= 8))
  );

  // ROI presence
  const hasRoi = Object.values(proposal.tiers || {}).some((tier) => tier.roi);

  // Urgency language
  const urgencyWords = [
    'urgent',
    'critical',
    'immediately',
    'asap',
    'now',
    'today',
    'before',
    'lose',
  ];
  const urgencyCount = urgencyWords.filter((word) => fullText.includes(word)).length;

  // Social proof (reviews, ratings, competitors)
  const hasSocialProof = ['review', 'rating', 'competitor', 'ahead', 'behind', 'comparison'].some(
    (word) => fullText.includes(word)
  );

  return {
    painPointAlignment: highImpactFindings > 0 ? 1 : 0,
    roiPresence: hasRoi ? 1 : 0,
    urgencyLanguage: Math.min(1, urgencyCount / 3),
    socialProof: hasSocialProof ? 1 : 0,
    score:
      ((highImpactReferenced ? 1 : 0) +
        (hasRoi ? 1 : 0) +
        Math.min(1, urgencyCount / 3) +
        (hasSocialProof ? 1 : 0)) /
      4,
  };
}

/**
 * Calculate visual quality score
 */
function calculateVisualQuality(proposal: ProposalResult): VisualMetrics {
  let visualEvidenceCount = 0;
  let screenshotAnnotations = 0;

  for (const tier of Object.values(proposal.tiers || {})) {
    if (tier.visualEvidence && Array.isArray(tier.visualEvidence)) {
      visualEvidenceCount += tier.visualEvidence.length;
      screenshotAnnotations += tier.visualEvidence.filter((v) => v.annotationText).length;
    }
  }

  const tierVisualQuality = visualEvidenceCount > 0 ? Math.min(1, visualEvidenceCount / 3) : 0;

  return {
    visualEvidenceCount,
    screenshotAnnotations,
    tierVisualQuality,
    score:
      (Math.min(1, visualEvidenceCount / 3) +
        Math.min(1, screenshotAnnotations / 3) +
        tierVisualQuality) /
      3,
  };
}

/**
 * Calculate personalization score
 */
function calculatePersonalization(
  proposal: ProposalResult,
  businessName?: string,
  city?: string,
  industry?: string
): PersonalizationMetrics {
  const fullText = JSON.stringify(proposal).toLowerCase();
  const businessNameLower = (businessName || '').toLowerCase();
  const cityLower = (city || '').toLowerCase();

  const businessNameInSummary =
    proposal.executiveSummary?.toLowerCase().includes(businessNameLower) || false;
  const industryContext = industry
    ? (INDUSTRY_TERMS[industry] || []).some((term) => fullText.includes(term.toLowerCase()))
    : false;
  const cityMentioned = cityLower ? fullText.includes(cityLower) : false;
  const competitorNamed = /\bvs\b|\bversus\b|\bcompetitor\b/i.test(fullText);

  // Custom recommendations (not generic)
  const genericPhrases = ['your business', 'your website', 'your company'];
  const customRecs = genericPhrases.filter((phrase) => fullText.includes(phrase)).length;

  return {
    businessNameInSummary,
    industryContext,
    cityMentioned,
    competitorNamed,
    customRecommendations: customRecs,
    score:
      ((businessNameInSummary ? 1 : 0) +
        (industryContext ? 1 : 0) +
        (cityMentioned ? 1 : 0) +
        (competitorNamed ? 0.5 : 0) +
        (customRecs >= 2 ? 1 : customRecs > 0 ? 0.5 : 0)) /
      5,
  };
}

/**
 * Score a single proposal
 */
export function scoreProposal(
  proposal: ProposalResult,
  findings: FindingRuntime[],
  options?: {
    auditId?: string;
    businessName?: string;
    city?: string;
    industry?: string;
    businessUrl?: string;
  }
): ProposalQualityScore {
  const clarity = calculateClarity(proposal);
  const specificity = calculateSpecificity(proposal, options?.businessName, options?.industry);
  const actionability = calculateActionability(proposal, findings);
  const persuasiveness = calculatePersuasiveness(proposal, findings);
  const visualQuality = calculateVisualQuality(proposal);
  const personalization = calculatePersonalization(
    proposal,
    options?.businessName,
    options?.city,
    options?.industry
  );

  const overall =
    (clarity.score +
      specificity.score +
      actionability.score +
      persuasiveness.score +
      visualQuality.score +
      personalization.score) /
    6;

  // Scale to 1-10
  let scaledOverall = Math.round(overall * 10 * 10) / 10;

  // Apply non-SMB penalty if generic local SEO or GBP is mentioned
  const segment = inferOrganizationSegment(
    options?.businessUrl,
    options?.businessName,
    options?.industry
  );
  const isNonSmb = segment !== 'smb_local' && segment !== 'baseline_unknown';
  let localSeoPenalty = 0;

  if (isNonSmb) {
    const fullText = JSON.stringify(proposal).toLowerCase();
    const localTermsFound = [
      'google business profile',
      'gbp',
      'google maps',
      'local reviews',
      'local marketing',
      'local seo',
    ].filter((term) => fullText.includes(term));
    if (localTermsFound.length > 0) {
      localSeoPenalty = Math.min(5.0, localTermsFound.length * 1.5);
      scaledOverall = Math.max(1.0, Math.round((scaledOverall - localSeoPenalty) * 10) / 10);
      logger.warn(
        {
          segment,
          localSeoPenalty,
          originalScore: Math.round(overall * 10 * 10) / 10,
          scaledOverall,
        },
        '[ProposalQualityScorer] Non-SMB target proposal penalized for generic local SEO / GBP mentions'
      );
    }
  }

  return {
    auditId: options?.auditId || 'unknown',
    clarity: Math.round(clarity.score * 10 * 10) / 10,
    specificity: Math.round(specificity.score * 10 * 10) / 10,
    actionability: Math.round(actionability.score * 10 * 10) / 10,
    persuasiveness: Math.round(persuasiveness.score * 10 * 10) / 10,
    visualQuality: Math.round(visualQuality.score * 10 * 10) / 10,
    personalization: Math.round(personalization.score * 10 * 10) / 10,
    overall: scaledOverall,
    passed: scaledOverall >= 8,
    breakdown: {
      clarity,
      specificity,
      actionability,
      persuasiveness,
      visualQuality,
      personalization,
    },
  };
}

/**
 * Score multiple proposals and calculate average
 */
export function scoreProposals(
  proposals: Array<{
    proposal: ProposalResult;
    findings: FindingRuntime[];
    auditId: string;
    businessName?: string;
    city?: string;
    industry?: string;
  }>
): {
  averageScore: number;
  passed: number;
  failed: number;
  total: number;
  scores: ProposalQualityScore[];
  passedAcceptanceCriteria: boolean;
} {
  const scores = proposals.map((p) =>
    scoreProposal(p.proposal, p.findings, {
      auditId: p.auditId,
      businessName: p.businessName,
      city: p.city,
      industry: p.industry,
    })
  );

  const averageScore = scores.reduce((acc, s) => acc + s.overall, 0) / scores.length;
  const passed = scores.filter((s) => s.passed).length;

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    passed,
    failed: scores.length - passed,
    total: scores.length,
    scores,
    passedAcceptanceCriteria: averageScore >= 8 && scores.length >= 50,
  };
}

/**
 * Log quality metrics
 */
export function logQualityMetrics(score: ProposalQualityScore): void {
  logger.info(
    {
      auditId: score.auditId,
      overall: score.overall,
      clarity: score.clarity,
      specificity: score.specificity,
      actionability: score.actionability,
      persuasiveness: score.persuasiveness,
      visualQuality: score.visualQuality,
      personalization: score.personalization,
      passed: score.passed,
    },
    'Proposal quality score'
  );
}
