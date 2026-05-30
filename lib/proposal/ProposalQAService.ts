import { Finding } from '@prisma/client';

import { inferOrganizationSegment } from '@/lib/proposal';
import { type QAContext, type QAStatus, runAutoQA } from '@/lib/qa/autoQA';

import { ProposalResult } from './types';

export interface RubricDimensions {
  evidenceQuality: number;
  relevance: number;
  specificity: number;
  clarity: number;
  pricingFit: number;
  copywritingSafety: number;
  clientReadiness: number;
}

export interface ProposalQAEvaluation {
  dimensions: RubricDimensions;
  overallScore: number;
  passed: boolean;
  feedbackLogs: string[];
  autoQAStatus: QAStatus;
}

const METRIC_PATTERN =
  /\d+(\.\d+)?(%|\/100|\s*(?:seconds?|ms|scores?|rating|reviews?|\$|points?|findings?|issues?|critical|painkillers?|load|speed|LCP|FCP|CLS|index|MB|kb|stars?|hours?|days?|minutes?|of|out\s+of|visitors?|customers?|bounce|traffic|conversion|percent|percentage))/gi;

const CTA_PATTERN = /(reply|schedule|book|call|start|get started|send it|approve|accept)/i;

function hasValidEvidence(e: any): boolean {
  if (!e) return false;
  if (typeof e === 'string') return e.trim().length > 0;
  if (typeof e !== 'object') return false;
  const obj = e as Record<string, any>;
  if (typeof obj.pointer === 'string' && obj.pointer.length > 0 && obj.collected_at) return true;
  if (obj.type && (obj.value !== undefined || obj.label)) return true;
  return !!(obj.url || obj.source || obj.raw);
}

export class ProposalQAService {
  /**
   * Evaluates a proposal against the 7-dimension rubric.
   */
  static evaluateProposal(
    proposal: ProposalResult,
    findings: Finding[],
    businessName: string,
    city: string | null,
    context?: QAContext
  ): ProposalQAEvaluation {
    const feedbackLogs: string[] = [];
    const summary = proposal.executiveSummary || '';
    const summaryLower = summary.toLowerCase();
    const industry = (context?.industry || '').toLowerCase();
    const url = (context?.businessUrl || '').toLowerCase();

    // 1. evidenceQuality
    const findingsWithEvidence = findings.filter((f) => {
      const evidence = (f.evidence as unknown[]) || [];
      return evidence.some(hasValidEvidence);
    });
    const evidenceQuality =
      findings.length > 0
        ? Number(((findingsWithEvidence.length / findings.length) * 10).toFixed(1))
        : 0;

    if (evidenceQuality < 7.0) {
      feedbackLogs.push(
        `evidenceQuality score of ${evidenceQuality}/10 is below threshold. Only ${findingsWithEvidence.length}/${findings.length} findings have valid evidence.`
      );
    }

    // 2. relevance
    const hasBusiness = summaryLower.includes(businessName.toLowerCase());
    const hasCity = city ? summaryLower.includes(city.toLowerCase()) : true;
    const hasIndustry = context?.industry
      ? summaryLower.includes(context.industry.toLowerCase())
      : true;

    let relevance = 0;
    if (hasBusiness) relevance += 4;
    if (hasCity) relevance += 3;
    if (hasIndustry) relevance += 3;

    if (relevance < 7.0) {
      const missing = [];
      if (!hasBusiness) missing.push('business name');
      if (!hasCity) missing.push('city name');
      if (!hasIndustry) missing.push('industry context');
      feedbackLogs.push(
        `relevance score of ${relevance}/10 is below threshold. Missing mentions of: ${missing.join(', ')}.`
      );
    }

    // 3. specificity
    const metricMatches = summary.match(METRIC_PATTERN) || [];
    const specificity = Math.min(10, Number(((metricMatches.length / 3) * 10).toFixed(1)));

    if (specificity < 7.0) {
      feedbackLogs.push(
        `specificity score of ${specificity}/10 is below threshold. Target density of >=3 quantified metrics not met (found ${metricMatches.length}).`
      );
    }

    // 4. clarity
    const topActionRows = (proposal.nextSteps || []).filter(
      (s) => /impact:/i.test(s) && /effort:/i.test(s) && /timeline:/i.test(s)
    );
    const clearCta = (proposal.nextSteps || []).some((line) => CTA_PATTERN.test(line));

    let clarity = 0;
    if (topActionRows.length >= 3) {
      clarity += 5;
    } else {
      clarity += topActionRows.length * 1.5;
    }
    if (clearCta) {
      clarity += 5;
    }

    if (clarity < 7.0) {
      const gaps = [];
      if (topActionRows.length < 3)
        gaps.push(
          `fewer than 3 action rows with impact/effort/timeline (found ${topActionRows.length})`
        );
      if (!clearCta) gaps.push('no clear Call-To-Action (CTA)');
      feedbackLogs.push(
        `clarity score of ${clarity}/10 is below threshold due to: ${gaps.join(' and ')}.`
      );
    }

    // 5. pricingFit
    const pricingLogic =
      proposal.pricing.essentials < proposal.pricing.growth &&
      proposal.pricing.growth < proposal.pricing.premium;
    const pricingFit = pricingLogic ? 10 : 0;

    if (pricingFit < 7.0) {
      feedbackLogs.push(
        `pricingFit score is 0/10. Pricing tier order violates rule: essentials ($${proposal.pricing.essentials}) < growth ($${proposal.pricing.growth}) < premium ($${proposal.pricing.premium}).`
      );
    }

    // 6. copywritingSafety
    const isNonProfit =
      /non-profit|nonprofit|charity|foundation|ngo|volunteer|association|social\s+impact/i.test(
        industry
      ) ||
      /gnu\.org/i.test(url) ||
      /gnu\.org/i.test(industry);

    const fullProposalText = JSON.stringify(proposal).toLowerCase();
    const commercialTerms = [
      'google business profile',
      'gbp',
      'google maps',
      'local map pack',
      'local citation',
      'local reviews',
      'local marketing',
      'local seo',
    ];
    const foundCommercialTerms = commercialTerms.filter((term) => fullProposalText.includes(term));

    // Also run original segment local marketing checks
    const segment = inferOrganizationSegment(url, businessName, context?.industry);
    const isNonSmb = segment !== 'smb_local' && segment !== 'baseline_unknown';
    const hasLocalSleaze = isNonSmb && foundCommercialTerms.length > 0;

    let copywritingSafety = 10;
    if (isNonProfit && foundCommercialTerms.length > 0) {
      copywritingSafety = 5;
      feedbackLogs.push(
        `copywritingSafety score set to ${copywritingSafety}/10. Safety check failed: Non-profit targets cannot use commercial or local SEO buzzwords. Found: ${foundCommercialTerms.join(', ')}.`
      );
    } else if (hasLocalSleaze) {
      copywritingSafety = 5;
      feedbackLogs.push(
        `copywritingSafety score set to ${copywritingSafety}/10. Safety check failed: Non-SMB enterprise targets cannot have local marketing terms leaking into copy. Found: ${foundCommercialTerms.join(', ')}.`
      );
    }

    // 7. clientReadiness (checks for any hard fails in autoQA results)
    const autoQAStatus = runAutoQA(proposal, findings, businessName, city, context);
    const hasHardFails = autoQAStatus.clientPerfect.hardFails.length > 0;
    const clientReadiness = hasHardFails ? 0 : 10;

    if (clientReadiness < 7.0) {
      const failDetails = autoQAStatus.clientPerfect.hardFails
        .map((f) => `[${f.code}] ${f.details}`)
        .join(', ');
      feedbackLogs.push(`clientReadiness score is 0/10 due to hard-fails: ${failDetails}.`);
    }

    // Compute Overall Score (Average of the 7 dimensions)
    const overallScore = Number(
      (
        (evidenceQuality +
          relevance +
          specificity +
          clarity +
          pricingFit +
          copywritingSafety +
          clientReadiness) /
        7
      ).toFixed(2)
    );

    // Check Kill-Switches
    const forceManualMode = process.env.KILL_SWITCH_FORCE_MANUAL_MODE === 'true';
    const autoPromotionEnabled = process.env.AUTOMATION_AUTO_QA_PROMOTION !== 'false';

    const meetsThresholds =
      overallScore >= 7.5 &&
      evidenceQuality >= 7.0 &&
      relevance >= 7.0 &&
      specificity >= 7.0 &&
      clarity >= 7.0 &&
      pricingFit >= 7.0 &&
      copywritingSafety >= 7.0 &&
      clientReadiness >= 7.0;

    const passed = meetsThresholds && !forceManualMode && autoPromotionEnabled;

    if (forceManualMode) {
      feedbackLogs.push(
        'System is in force manual review mode (KILL_SWITCH_FORCE_MANUAL_MODE=true). Promotion bypassed.'
      );
    }
    if (!autoPromotionEnabled) {
      feedbackLogs.push(
        'Automated QA promotion is disabled (AUTOMATION_AUTO_QA_PROMOTION=false). Promotion bypassed.'
      );
    }

    return {
      dimensions: {
        evidenceQuality,
        relevance,
        specificity,
        clarity,
        pricingFit,
        copywritingSafety,
        clientReadiness,
      },
      overallScore,
      passed,
      feedbackLogs,
      autoQAStatus,
    };
  }
}
