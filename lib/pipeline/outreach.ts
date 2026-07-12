/**
 * Outreach Agent — Generates personalized, proof-backed outreach emails
 *
 * Creates emails that reference ≥2 specific audit findings, include scorecard URLs,
 * translate technical findings into vertical-specific pain language, and schedule
 * behavior-based follow-up sequences.
 *
 * Integrates with Email QA Scorer (only send if score >= 90) and regenerates
 * up to 3 times on QA failure.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8
 */

import { v4 as uuidv4 } from 'uuid';

import { validateCustomerClaim } from '@/lib/claims/claimContract';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { DEFAULT_EMAIL_QA_CONFIG, score as scoreEmail } from './emailQaScorer';
import {
  cancelPendingFollowUps,
  pauseFollowUpSequence,
  updatePendingFollowUps,
} from './followUpSequence';
import { sendWithRotation as sendEmailWithRotation } from './inboxRotation';
import { claimFollowUpSchedule, releaseFollowUpSchedule } from '../outreach/outboundSafety';

import type {
  EmailQAConfig,
  GeneratedEmail,
  OutreachContext,
  OutreachEventType,
  SendResult,
} from './types';

// ============================================================================
// Vertical Pain Language Translation
// ============================================================================

/**
 * Returns the observed finding text. Outreach must not infer customer outcomes from an
 * industry label or a technical signal.
 */
export function translateFinding(
  finding: { title?: unknown; description?: unknown },
  _vertical: string
): string {
  const title = typeof finding.title === 'string' ? finding.title.trim() : '';
  const description = typeof finding.description === 'string' ? finding.description.trim() : '';
  return [title, description].filter(Boolean).join(': ') || 'Observed audit finding';
}

/**
 * Selects the top N findings by severity/impact for email inclusion.
 * Ensures at least 2 findings are selected (requirement 4.1).
 */
export function selectTopFindings(findings: any[], count: number = 2): any[] {
  if (findings.length <= count) return findings;

  // Sort by severity (high > medium > low) then by impact score
  const sorted = [...findings].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const sevA = severityOrder[(a.severity || 'medium').toLowerCase()] || 2;
    const sevB = severityOrder[(b.severity || 'medium').toLowerCase()] || 2;
    if (sevA !== sevB) return sevB - sevA;
    return (b.impactScore || 0) - (a.impactScore || 0);
  });

  return sorted.slice(0, count);
}

// ============================================================================
// Follow-Up Schedule
// ============================================================================

/** Default follow-up schedule in days after initial send */
const DEFAULT_FOLLOWUP_DAYS = [3, 7, 14];

/** Maps behavior events to follow-up email types */
const BEHAVIOR_BRANCH_MAP: Record<string, { type: string; description: string }> = {
  open: { type: 'FOLLOWUP_COMPETITOR', description: 'observed-data review' },
  click: { type: 'FOLLOWUP_PROPOSAL', description: 'full proposal delivery' },
  reply: { type: 'FOLLOWUP_PROPOSAL', description: 'pause sequence - reply received' },
  bounce: { type: 'FOLLOWUP_RETRY', description: 'different subject/time' },
  unsubscribe: { type: 'FOLLOWUP_RETRY', description: 'drop from sequence' },
};

// ============================================================================
// Email Generation
// ============================================================================

/**
 * Generates a personalized, proof-backed outreach email.
 *
 * - References ≥2 specific findings from the audit
 * - Includes a scorecard URL (/preview/{token})
 * - Translates technical findings into vertical-specific pain language
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export async function generateEmail(context: OutreachContext): Promise<GeneratedEmail> {
  const { prospect, proposal, findings, tenantBranding } = context;
  const auditId = context.audit?.id;
  const tenantId = prospect?.tenantId;
  if (!auditId || !tenantId || proposal?.auditId !== auditId || proposal?.tenantId !== tenantId) {
    throw new Error('outreach generation requires a proposal and audit from the prospect tenant');
  }
  if (!tenantBranding?.footerText) {
    throw new Error('outreach generation requires configured tenant footer text');
  }

  const topFindings = selectTopFindings(findings, Math.max(2, Math.min(findings.length, 3)));
  if (topFindings.length === 0) {
    throw new Error('outreach generation requires validated Findings');
  }

  const findingReferences = topFindings.map((finding) => {
    const text = [finding.title, finding.description].filter(Boolean).join(': ');
    const validation = validateCustomerClaim(
      {
        claimId: `outreach:${proposal.id}:${finding.id}`,
        text,
        claimType: 'DETERMINISTIC_OBSERVATION',
        sourceFindingIds: [finding.id],
        configurationRefs: [],
        classification: 'deterministic',
        confidence: Math.max(0, Math.min(1, Number(finding.confidenceScore) / 10)),
        assumptions: [],
        metricInputs: [],
        estimate: false,
        recommendation: false,
        provenance: {
          producer: 'pipeline.outreach.generateEmail',
        },
      },
      { auditId, tenantId, findings }
    );
    if (!validation.success) {
      throw new Error(`outreach claim validation failed: ${validation.issues.join('; ')}`);
    }
    return text;
  });

  const scorecardToken = proposal.webLinkToken || proposal.id;
  const scorecardUrl = `/preview/${scorecardToken}`;
  const businessName = prospect.businessName || prospect.name || 'your business';
  const brandName = tenantBranding?.brandName || 'Our Team';
  const subject = `Question about ${businessName}`;
  const emailId = uuidv4();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const trackingPixelUrl = `${appUrl}/api/email/tracking?proposalId=${proposal.id}&step=1&variant=A&eventType=open`;
  const trackingScorecardUrl = `${appUrl}/api/email/tracking?proposalId=${proposal.id}&step=1&variant=A&eventType=click&url=${encodeURIComponent(scorecardUrl)}`;
  const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?email=${encodeURIComponent(prospect.decisionMakerEmail || '')}`;
  const body = buildEmailBody({
    businessName,
    brandName,
    findingReferences,
    scorecardUrl: trackingScorecardUrl,
    trackingPixelUrl,
    unsubscribeUrl,
    tenantFooter: tenantBranding.footerText,
  });

  return {
    id: emailId,
    auditId,
    subject,
    body,
    prospectId: prospect.id,
    proposalId: proposal.id,
    findingIds: topFindings.map((finding) => finding.id),
    findingReferences,
    scorecardUrl: trackingScorecardUrl,
    generatedAt: new Date(),
  };
}

interface EmailBodyParams {
  businessName: string;
  brandName: string;
  findingReferences: string[];
  scorecardUrl: string;
  trackingPixelUrl?: string;
  unsubscribeUrl?: string;
  tenantFooter: string;
}

/**
 * Builds the email body with pain language, finding references, and scorecard link.
 * Targets < 80 words and 5th grade reading level per QA requirements.
 */
function buildEmailBody(params: EmailBodyParams): string {
  const {
    businessName,
    brandName,
    findingReferences,
    scorecardUrl,
    trackingPixelUrl,
    unsubscribeUrl,
    tenantFooter,
  } = params;

  const bodyHtml = `
<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
  <p>Hi,</p>
  <p>We reviewed publicly available pages for ${escapeHtml(businessName)} and noted:</p>
  <ul style="padding-left: 20px; margin: 10px 0;">
    ${findingReferences
      .slice(0, 3)
      .map((reference) => `<li style="margin-bottom: 5px;">${escapeHtml(reference)}</li>`)
      .join('')}
  </ul>
  <p>We prepared a scorecard with the supporting observations: <a href="${escapeHtml(scorecardUrl)}">View the scorecard</a></p>
  <p>Happy to walk you through it.</p>
  <p>${escapeHtml(brandName)}</p>
  
  <br><br>
  
  <div style="font-size: 10px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
    <p>${escapeHtml(tenantFooter)}</p>
    <p>Don't want to receive these emails? <a href="${escapeHtml(unsubscribeUrl || '#')}" style="color: #999; text-decoration: underline;">Unsubscribe here</a></p>
  </div>
  ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />` : ''}
</div>
`;

  return bodyHtml;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] || character;
  });
}

// ============================================================================
// Email Generation with QA Gate
// ============================================================================

/**
 * Generates an email and qualifies it through the Email QA Scorer.
 *
 * - Calls generateEmail(), then scores with Email QA Scorer
 * - If score < 90, regenerates up to 3 times
 * - After 3 failures, throws with "generation_failed"
 *
 * Requirements: 4.4, 4.5
 */
export async function generateAndQualifyEmail(
  context: OutreachContext,
  config: EmailQAConfig = DEFAULT_EMAIL_QA_CONFIG
): Promise<GeneratedEmail> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const email = await generateEmail(context);
    const qaResult = scoreEmail(email, config);

    if (qaResult.passed) {
      return email;
    }

    // Log the QA failure for observability
    logger.warn({ attempt, maxAttempts, score: qaResult.compositeScore }, 'Email QA failed');
  }

  throw new Error('generation_failed');
}

// ============================================================================
// Follow-Up Scheduling
// ============================================================================

/**
 * Schedules behavior-based follow-up emails after an initial send.
 *
 * Creates follow-up email records at [3, 7, 14] days after initial send.
 * Each follow-up uses branching logic based on prospect behavior.
 *
 * Requirements: 4.8
 */
export async function scheduleFollowUps(
  leadId: string,
  initialEmailId: string,
  followUpDays: number[] = DEFAULT_FOLLOWUP_DAYS
): Promise<void> {
  // Get the initial email to determine tenant and timing
  const initialEmail = await prisma.outreachEmail.findUnique({
    where: { id: initialEmailId },
    select: { tenantId: true, sentAt: true, createdAt: true, leadId: true },
  });

  if (!initialEmail) {
    throw new Error(`Initial email not found: ${initialEmailId}`);
  }

  const baseDate = initialEmail.sentAt || initialEmail.createdAt;
  const tenantId = initialEmail.tenantId;

  // Create follow-up records for each scheduled day
  const followUpTypes: Array<'FOLLOWUP_COMPETITOR' | 'FOLLOWUP_PROPOSAL' | 'FOLLOWUP_RETRY'> = [
    'FOLLOWUP_COMPETITOR',
    'FOLLOWUP_PROPOSAL',
    'FOLLOWUP_RETRY',
  ];

  for (let i = 0; i < followUpDays.length; i++) {
    const days = followUpDays[i];
    if (days === undefined) continue;
    const scheduledDate = new Date(baseDate);
    scheduledDate.setDate(scheduledDate.getDate() + days);

    const sequencePosition = i + 1;
    if (!(await claimFollowUpSchedule(tenantId, initialEmailId, sequencePosition))) continue;

    try {
      await prisma.outreachEmail.create({
        data: {
          tenantId,
          leadId,
          type: followUpTypes[i] || 'FOLLOWUP_RETRY',
          status: 'PENDING',
          subject: `Follow-up ${sequencePosition}`,
          body: '',
          qualityScore: 0,
          scorecardUrl: null,
          scheduledAt: scheduledDate,
          sequencePosition,
        },
      });
    } catch (error) {
      await releaseFollowUpSchedule(tenantId, initialEmailId, sequencePosition);
      throw error;
    }
  }
}

// ============================================================================
// Behavior-Based Branching
// ============================================================================

/**
 * Processes a behavior event and adjusts the follow-up sequence accordingly.
 *
 * Branching logic:
 * - opened → observed-data review
 * - clicked → full proposal delivery within 2 hours
 * - viewed 2+ min → hot lead escalation
 * - no reply after 3 → subject variation
 * - never opened → different time/subject, drop after 3
 *
 * Requirements: 4.8
 */
export async function processBehaviorBranch(
  leadId: string,
  event: OutreachEventType
): Promise<void> {
  switch (event) {
    case 'open': {
      // Opened but did not click → observed-data review
      await updatePendingFollowUps(leadId, 'FOLLOWUP_COMPETITOR');
      break;
    }
    case 'click': {
      // Clicked audit link → full proposal delivery within 2 hours
      await updatePendingFollowUps(leadId, 'FOLLOWUP_PROPOSAL');
      // Schedule an immediate follow-up for proposal delivery
      const [email] = await prisma.outreachEmail.findMany({
        where: { leadId, type: 'INITIAL', status: 'SENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (email) {
        await prisma.outreachEmail.create({
          data: {
            tenantId: email.tenantId,
            leadId,
            type: 'FOLLOWUP_PROPOSAL',
            status: 'PENDING',
            subject: 'Your full proposal is ready',
            body: '', // Will be generated at send time
            qualityScore: 0,
          },
        });
      }
      break;
    }
    case 'reply': {
      // Reply received → pause all follow-ups
      await pauseFollowUpSequence(leadId);
      // Record the reply event
      await prisma.outreachEmailEvent.create({
        data: {
          tenantId: (await getLeadTenantId(leadId)) || '',
          leadId,
          type: 'REPLY_RECEIVED',
          metadata: { pausedFollowUps: true },
        },
      });
      break;
    }
    case 'bounce':
    case 'unsubscribe': {
      // Never opened / bounce → different time/subject, drop after 3
      const sentCount = await prisma.outreachEmail.count({
        where: { leadId, status: 'SENT' },
      });
      if (sentCount >= 3) {
        // Drop from sequence after 3 attempts
        await cancelPendingFollowUps(leadId);
      } else {
        await updatePendingFollowUps(leadId, 'FOLLOWUP_RETRY');
      }
      break;
    }
  }
}

// ============================================================================
// Email Sending with Rotation
// ============================================================================

/**
 * Sends an email using inbox rotation.
 * Delegates to the inboxRotation module for domain selection and sending.
 *
 * Requirements: 4.6
 */
export async function sendWithRotation(
  email: GeneratedEmail,
  tenantId: string
): Promise<SendResult> {
  return sendEmailWithRotation(email, tenantId);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Updates all pending follow-ups for a lead to a specific type.
 */
/**
 * Gets the tenant ID for a lead.
 */
async function getLeadTenantId(leadId: string): Promise<string | null> {
  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { tenantId: true },
  });
  return lead?.tenantId || null;
}
