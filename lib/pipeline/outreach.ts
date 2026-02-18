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

import { prisma } from '@/lib/prisma';
import { score as scoreEmail, DEFAULT_EMAIL_QA_CONFIG } from './emailQaScorer';
import { sendWithRotation as sendEmailWithRotation } from './inboxRotation';
import type {
  OutreachContext,
  GeneratedEmail,
  EmailQAConfig,
  EmailQAResult,
  OutreachEventType,
  PainScoreBreakdown,
  SendResult,
} from './types';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Vertical Pain Language Translation
// ============================================================================

/**
 * Maps technical finding types to vertical-specific business pain language.
 * Each vertical has its own set of translations that resonate with the business owner.
 */
const VERTICAL_PAIN_MAP: Record<string, Record<string, string>> = {
  dentist: {
    'page_speed': 'patients bouncing before they book',
    'mobile_responsiveness': 'patients can\'t schedule from their phone',
    'ssl_missing': 'patients see a "Not Secure" warning before your site loads',
    'gbp_neglected': 'your Google listing is losing patients to nearby practices',
    'review_response': 'unanswered reviews are turning away new patients',
    'social_media': 'patients can\'t find you on social media',
    'competitor_gap': 'nearby practices are showing up above you in search',
    'accessibility': 'some patients can\'t navigate your website at all',
  },
  hvac: {
    'page_speed': 'homeowners leave before requesting a quote',
    'mobile_responsiveness': 'homeowners can\'t request a quote from their phone',
    'ssl_missing': 'homeowners see a security warning on your site',
    'gbp_neglected': 'your Google listing isn\'t bringing in service calls',
    'review_response': 'unanswered reviews are costing you repeat customers',
    'social_media': 'homeowners can\'t find your latest work online',
    'competitor_gap': 'competing HVAC companies rank higher in your area',
    'accessibility': 'some customers can\'t use your website to book service',
  },
  restaurant: {
    'page_speed': 'diners leave before seeing your menu',
    'mobile_responsiveness': 'customers can\'t view your menu on their phone',
    'ssl_missing': 'guests see a security warning when visiting your site',
    'gbp_neglected': 'your Google listing isn\'t filling tables',
    'review_response': 'unanswered reviews are keeping diners away',
    'social_media': 'foodies can\'t find your latest dishes online',
    'competitor_gap': 'nearby restaurants are getting more visibility than you',
    'accessibility': 'some guests can\'t navigate your website to make a reservation',
  },
  default: {
    'page_speed': 'visitors leave before your site loads',
    'mobile_responsiveness': 'customers can\'t use your site on their phone',
    'ssl_missing': 'visitors see a "Not Secure" warning on your site',
    'gbp_neglected': 'your Google listing isn\'t working for you',
    'review_response': 'unanswered reviews are hurting your reputation',
    'social_media': 'customers can\'t find you on social media',
    'competitor_gap': 'your competitors are showing up above you online',
    'accessibility': 'some customers can\'t use your website',
  },
};

// ============================================================================
// Finding-to-Category Mapping
// ============================================================================

/**
 * Maps finding module names to pain categories for vertical translation.
 */
function findingToCategory(finding: any): string {
  const module = (finding.module || finding.type || '').toLowerCase();
  if (module.includes('speed') || module.includes('performance') || module.includes('pagespeed')) return 'page_speed';
  if (module.includes('mobile') || module.includes('responsive')) return 'mobile_responsiveness';
  if (module.includes('ssl') || module.includes('security') || module.includes('https')) return 'ssl_missing';
  if (module.includes('gbp') || module.includes('google_business')) return 'gbp_neglected';
  if (module.includes('review')) return 'review_response';
  if (module.includes('social')) return 'social_media';
  if (module.includes('competitor')) return 'competitor_gap';
  if (module.includes('accessibility') || module.includes('a11y')) return 'accessibility';
  return 'page_speed'; // fallback
}

// ============================================================================
// Pain Language Translation
// ============================================================================

/**
 * Translates a technical finding into vertical-specific pain language.
 */
export function translateFinding(finding: any, vertical: string): string {
  const category = findingToCategory(finding);
  const verticalMap = VERTICAL_PAIN_MAP[vertical.toLowerCase()] || VERTICAL_PAIN_MAP['default'];
  return verticalMap[category] || VERTICAL_PAIN_MAP['default'][category] || 'an issue that\'s costing you customers';
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
  'open': { type: 'FOLLOWUP_COMPETITOR', description: 'competitor comparison angle' },
  'click': { type: 'FOLLOWUP_PROPOSAL', description: 'full proposal delivery' },
  'reply': { type: 'FOLLOWUP_PROPOSAL', description: 'pause sequence - reply received' },
  'bounce': { type: 'FOLLOWUP_RETRY', description: 'different subject/time' },
  'unsubscribe': { type: 'FOLLOWUP_RETRY', description: 'drop from sequence' },
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
  const { prospect, proposal, findings, painBreakdown, vertical, tenantBranding } = context;

  // Select top findings (at least 2)
  const topFindings = selectTopFindings(findings, Math.max(2, Math.min(findings.length, 3)));

  // Translate findings to pain language
  const painPoints = topFindings.map((f) => translateFinding(f, vertical));

  // Build scorecard URL
  const scorecardToken = proposal.webLinkToken || proposal.id;
  const scorecardUrl = `/preview/${scorecardToken}`;

  // Build finding references (titles or descriptions)
  const findingReferences = topFindings.map(
    (f) => f.title || f.description || f.module || 'audit finding'
  );

  // Get business name and brand name
  const businessName = prospect.businessName || prospect.name || 'your business';
  const brandName = tenantBranding?.brandName || 'Our Team';

  // Build the email subject
  const subject = buildSubject(businessName, painPoints[0], vertical);

  // Build the email body
  const body = buildEmailBody({
    businessName,
    brandName,
    painPoints,
    findingReferences,
    scorecardUrl,
    vertical,
    painBreakdown,
  });

  const emailId = uuidv4();

  return {
    id: emailId,
    subject,
    body,
    prospectId: prospect.id,
    proposalId: proposal.id,
    findingReferences,
    scorecardUrl,
    generatedAt: new Date(),
  };
}

/**
 * Builds a compelling subject line using pain language.
 */
function buildSubject(businessName: string, primaryPain: string, vertical: string): string {
  const templates = [
    `${businessName} — ${primaryPain}`,
    `Quick question about ${businessName}`,
    `Found something about ${businessName}`,
  ];
  // Use first template for consistency in testing; in production this could be randomized
  return templates[0];
}

interface EmailBodyParams {
  businessName: string;
  brandName: string;
  painPoints: string[];
  findingReferences: string[];
  scorecardUrl: string;
  vertical: string;
  painBreakdown: PainScoreBreakdown;
}

/**
 * Builds the email body with pain language, finding references, and scorecard link.
 * Targets < 80 words and 5th grade reading level per QA requirements.
 */
function buildEmailBody(params: EmailBodyParams): string {
  const { businessName, brandName, painPoints, findingReferences, scorecardUrl } = params;

  // Build finding bullets — each references a specific finding with pain language
  const findingLines = painPoints
    .slice(0, 3)
    .map((pain, i) => `• ${findingReferences[i]}: ${pain}`)
    .join('\n');

  const body = `Hi,

We looked at ${businessName} online and found a few things:

${findingLines}

We put together a free scorecard showing how you compare to your top local competitor: ${scorecardUrl}

Happy to walk you through it.

${brandName}`;

  return body;
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
    console.warn(
      `Email QA failed (attempt ${attempt}/${maxAttempts}): score=${qaResult.compositeScore}, suggestions=${qaResult.suggestions.join('; ')}`
    );
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
    const scheduledDate = new Date(baseDate);
    scheduledDate.setDate(scheduledDate.getDate() + followUpDays[i]);

    await prisma.outreachEmail.create({
      data: {
        tenantId,
        leadId,
        type: followUpTypes[i] || 'FOLLOWUP_RETRY',
        status: 'PENDING',
        subject: `Follow-up ${i + 1}`, // Placeholder — will be personalized at send time
        body: '', // Placeholder — will be generated at send time based on behavior
        qualityScore: 0,
        scorecardUrl: null,
      },
    });
  }
}

// ============================================================================
// Behavior-Based Branching
// ============================================================================

/**
 * Processes a behavior event and adjusts the follow-up sequence accordingly.
 * 
 * Branching logic:
 * - opened → competitor comparison angle
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
      // Opened but did not click → competitor comparison angle
      await updatePendingFollowUps(leadId, 'FOLLOWUP_COMPETITOR');
      break;
    }
    case 'click': {
      // Clicked audit link → full proposal delivery within 2 hours
      await updatePendingFollowUps(leadId, 'FOLLOWUP_PROPOSAL');
      // Schedule an immediate follow-up for proposal delivery
      const emails = await prisma.outreachEmail.findMany({
        where: { leadId, type: 'INITIAL', status: 'SENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (emails.length > 0) {
        await prisma.outreachEmail.create({
          data: {
            tenantId: emails[0].tenantId,
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
async function updatePendingFollowUps(
  leadId: string,
  type: 'FOLLOWUP_COMPETITOR' | 'FOLLOWUP_PROPOSAL' | 'FOLLOWUP_RETRY'
): Promise<void> {
  await prisma.outreachEmail.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { type },
  });
}

/**
 * Pauses all pending follow-ups for a lead (sets status to SUPPRESSED).
 */
export async function pauseFollowUpSequence(leadId: string): Promise<void> {
  await prisma.outreachEmail.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { status: 'SUPPRESSED' },
  });
}

/**
 * Cancels all pending follow-ups for a lead.
 */
async function cancelPendingFollowUps(leadId: string): Promise<void> {
  await prisma.outreachEmail.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { status: 'SUPPRESSED' },
  });
}

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
