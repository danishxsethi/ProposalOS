import { Finding } from '@prisma/client';

import { validateFinding } from '@/lib/audit/findingContract';
import { inferOrganizationSegment } from '@/lib/proposal';
import { validateProposalGrounding } from '@/lib/proposal/grounding';
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

const CTA_PATTERN = /(reply|schedule|book|call|start|get started|send it|approve|accept)/i;

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
    const industry = (context?.industry || '').toLowerCase();
    const url = (context?.businessUrl || '').toLowerCase();

    // 1. evidenceQuality
    const findingsWithEvidence = findings.filter((finding) => validateFinding(finding).success);
    const evidenceQuality =
      findings.length > 0
        ? Number(((findingsWithEvidence.length / findings.length) * 10).toFixed(1))
        : 0;

    if (evidenceQuality < 7.0) {
      feedbackLogs.push(
        `evidenceQuality score of ${evidenceQuality}/10 is below threshold. Only ${findingsWithEvidence.length}/${findings.length} findings have valid evidence.`
      );
    }

    const firstFinding = findings[0];
    const grounding = firstFinding
      ? validateProposalGrounding(proposal, {
          auditId: firstFinding.auditId,
          tenantId: firstFinding.tenantId,
          findings,
        })
      : { valid: false, errors: ['Proposal requires at least one validated Finding'] };

    // 2. relevance
    const relevance = summary.trim().length > 0 && grounding.valid ? 10 : 0;

    if (relevance < 7.0) {
      feedbackLogs.push(
        `relevance score of ${relevance}/10 is below threshold. ${grounding.errors.join('; ')}`
      );
    }

    // 3. specificity
    const specificity = grounding.valid ? 10 : 0;

    if (specificity < 7.0) {
      feedbackLogs.push(
        `specificity score of ${specificity}/10 is below threshold because claim grounding failed.`
      );
    }

    // 4. clarity
    const topActionRows = proposal.topActions ?? [];
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
      if (topActionRows.length < Math.min(3, findings.length))
        gaps.push(`missing Finding-backed priority actions (found ${topActionRows.length})`);
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
    // Healthcare practices are commonly local SMBs. Keep their GBP/local SEO
    // recommendations valid instead of treating every healthcare segment as
    // enterprise copy leakage.
    const isNonSmb =
      segment !== 'smb_local' && segment !== 'baseline_unknown' && segment !== 'healthcare';
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
