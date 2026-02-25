/**
 * Email Sequence Branching - Behavioral State Machine
 * 
 * This module implements the logic for determining which email to send next
 * based on recipient engagement (opens, clicks, replies).
 */

import { prisma } from '@/lib/prisma';

export type EngagementState = 
  | 'NOT_SENT'
  | 'INITIAL_SENT'
  | 'OPENED'
  | 'CLICKED'
  | 'REPLIED'
  | 'CONVERTED'
  | 'DROPPED';

export interface EmailSequenceState {
  proposalId: string;
  currentStep: number; // 1-5
  engagementState: EngagementState;
  lastInteractionAt?: Date;
  interactionCount: number;
}

export interface BranchingDecision {
  nextStep: number;
  emailToSend: 'EMAIL_1' | 'EMAIL_2' | 'EMAIL_3' | 'EMAIL_4' | 'EMAIL_5' | 'NONE';
  subject: string;
  body: string;
  shouldSend: boolean;
  reason: string;
}

/**
 * Determine the next email to send based on engagement state
 */
export async function getNextEmailDecision(
  proposalId: string
): Promise<BranchingDecision> {
  // Get the email sequence for this proposal
  const emailSequence = await prisma.emailSequence.findUnique({
    where: { proposalId }
  });

  if (!emailSequence) {
    return {
      nextStep: 1,
      emailToSend: 'EMAIL_1',
      subject: '',
      body: '',
      shouldSend: false,
      reason: 'No email sequence found for proposal'
    };
  }

  const emails = emailSequence.emails as Array<{
    step: number;
    subjectA: string;
    subjectB: string;
    body: string;
    status: string;
  }>;

  // Get outreach records to determine engagement
  const outreachRecords = await prisma.proposalOutreach.findMany({
    where: { proposalId },
    orderBy: { sentAt: 'asc' }
  });

  const analytics = emailSequence.analytics as Record<string, {
    sent: number;
    opens: number;
    clicks: number;
    replies: number;
  }>;

  // Determine current engagement state
  const engagementState = determineEngagementState(outreachRecords, analytics);
  
  // Get the next step to send
  const sentEmails = outreachRecords.length;
  const currentStep = Math.min(sentEmails + 1, 5);

  if (currentStep > 5) {
    return {
      nextStep: 5,
      emailToSend: 'NONE',
      subject: '',
      body: '',
      shouldSend: false,
      reason: 'All 5 emails have been sent'
    };
  }

  const nextEmail = emails.find(e => e.step === currentStep);
  
  if (!nextEmail) {
    return {
      nextStep: currentStep,
      emailToSend: 'NONE',
      subject: '',
      body: '',
      shouldSend: false,
      reason: `Email step ${currentStep} not found in sequence`
    };
  }

  // Apply branching logic based on engagement
  const branchingResult = applyBranchingLogic(
    engagementState,
    currentStep,
    nextEmail
  );

  // Update the analytics tracking
  await updateEngagementTracking(proposalId, engagementState, currentStep);

  return branchingResult;
}

/**
 * Determine the engagement state based on outreach records and analytics
 */
function determineEngagementState(
  outreachRecords: any[],
  analytics: Record<string, any>
): EngagementState {
  if (outreachRecords.length === 0) {
    return 'NOT_SENT';
  }

  const lastRecord = outreachRecords[outreachRecords.length - 1];
  const hasReplied = outreachRecords.some(r => r.repliedAt);
  const hasClicked = outreachRecords.some(r => r.clickedAt);
  const hasOpened = outreachRecords.some(r => r.openedAt);

  // Check for conversion (proposal accepted)
  // We would check ProposalAcceptance here

  if (hasReplied) {
    return 'REPLIED';
  }

  if (hasClicked) {
    return 'CLICKED';
  }

  if (hasOpened) {
    return 'OPENED';
  }

  // Check if enough time has passed since last send without any engagement
  if (lastRecord?.sentAt) {
    const daysSinceLastSend = Math.floor(
      (Date.now() - new Date(lastRecord.sentAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // If 7+ days and no engagement, mark as dropped
    if (daysSinceLastSend >= 7 && !hasOpened) {
      return 'DROPPED';
    }
  }

  return 'INITIAL_SENT';
}

/**
 * Apply branching logic based on engagement state
 */
function applyBranchingLogic(
  engagementState: EngagementState,
  currentStep: number,
  email: { step: number; subjectA: string; subjectB: string; body: string }
): BranchingDecision {
  // Branch 1: Cold lead - skipped to more persuasive content
  if (engagementState === 'DROPPED' || engagementState === 'NOT_SENT') {
    // Skip to stronger content
    if (currentStep < 3) {
      return {
        nextStep: currentStep,
        emailToSend: `EMAIL_${currentStep}` as any,
        subject: email.subjectA,
        body: getColdLeadVariant(email.body, currentStep),
        shouldSend: true,
        reason: `Cold lead - sending email ${currentStep} with stronger hooks`
      };
    }
  }

  // Branch 2: Opened but didn't click - send with clearer CTA
  if (engagementState === 'OPENED') {
    return {
      nextStep: currentStep,
      emailToSend: `EMAIL_${currentStep}` as any,
      subject: email.subjectA,
      body: getOpenedVariant(email.body, currentStep),
      shouldSend: true,
      reason: `Lead opened previous email - sending email ${currentStep} with clearer CTA`
    };
  }

  // Branch 3: Clicked - send to close
  if (engagementState === 'CLICKED') {
    return {
      nextStep: currentStep,
      emailToSend: `EMAIL_${currentStep}` as any,
      subject: email.subjectA,
      body: getClickedVariant(email.body, currentStep),
      shouldSend: true,
      reason: `Lead clicked - sending email ${currentStep} with close attempt`
    };
  }

  // Branch 4: Replied - personal follow-up
  if (engagementState === 'REPLIED') {
    // Don't send automated sequence - flag for personal follow-up
    return {
      nextStep: currentStep,
      emailToSend: 'NONE',
      subject: '',
      body: '',
      shouldSend: false,
      reason: 'Lead replied - flag for personal follow-up'
    };
  }

  // Default: Send next email in sequence
  return {
    nextStep: currentStep,
    emailToSend: `EMAIL_${currentStep}` as any,
    subject: email.subjectA,
    body: email.body,
    shouldSend: true,
    reason: `Standard sequence - sending email ${currentStep}`
  };
}

/**
 * Get variant body for cold leads - stronger hooks
 */
function getColdLeadVariant(body: string, step: number): string {
  const hooks: Record<number, string> = {
    1: "I wanted to make sure you saw this — the audit shows some significant opportunities.",
    2: "Quick follow-up on the audit. There's one finding I think you'll want to see.",
    3: "Curious if you had a chance to look at the audit. Here's what stood out to me.",
    4: "I wanted to follow up personally. Your ROI potential is substantial.",
    5: "This is my last email about the audit. I want to make sure you don't miss out."
  };
  
  const hook = hooks[step] || hooks[1];
  return `${hook}\n\n${body}`;
}

/**
 * Get variant body for leads who opened - clearer CTA
 */
function getOpenedVariant(body: string, step: number): string {
  const cta: Record<number, string> = {
    1: "\n\nWant to discuss the findings? Just reply and we can schedule a quick call.",
    2: "\n\nClick here to view the full report → [LINK]",
    3: "\n\nReady to get started? Reply 'YES' and I'll send over the next steps.",
    4: "\n\nShall I walk you through the ROI model? It's pretty compelling.",
    5: "\n\nThis offer is valid for one more week. Let's talk before it expires."
  };
  
  const ctaText = cta[step] || cta[1];
  return `${body}${ctaText}`;
}

/**
 * Get variant body for leads who clicked - close attempt
 */
function getClickedVariant(body: string, step: number): string {
  const close: Record<number, string> = {
    1: "\n\nGreat to see you're interested! Let's discuss how to move forward.",
    2: "\n\nSince you checked out the report, I'd love to answer any questions.",
    3: "\n\nI have availability this week to get started. Should we lock in your spot?",
    4: "\n\nBased on your interest, I'd recommend the Growth tier. Want me to send the invoice?",
    5: "\n\nFinal call — I'm at capacity for this month. Reply to secure your spot."
  };
  
  const closeText = close[step] || close[1];
  return `${body}${closeText}`;
}

/**
 * Update engagement tracking in the database
 */
async function updateEngagementTracking(
  proposalId: string,
  engagementState: EngagementState,
  step: number
): Promise<void> {
  const emailSequence = await prisma.emailSequence.findUnique({
    where: { proposalId }
  });

  if (!emailSequence) return;

  const analytics = emailSequence.analytics as Record<string, any>;
  const stepKey = `step_${step}`;

  await prisma.emailSequence.update({
    where: { proposalId },
    data: {
      analytics: {
        ...analytics,
        lastEngagementState: engagementState,
        lastStepUpdated: step,
        lastUpdated: new Date().toISOString()
      }
    }
  });
}

/**
 * Process all pending email sequences - called by cron job
 */
export async function processPendingEmailSequences(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
}> {
  const proposals = await prisma.proposal.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      sentAt: { not: null }
    },
    include: {
      emailSequence: true
    }
  });

  let sent = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    if (!proposal.emailSequence) continue;

    const decision = await getNextEmailDecision(proposal.id);
    
    if (decision.shouldSend) {
      // TODO: Trigger actual email send via email sender
      console.log(`Would send email ${decision.nextStep} to proposal ${proposal.id}`);
      sent++;
    } else {
      skipped++;
    }
  }

  return {
    processed: proposals.length,
    sent,
    skipped
  };
}
