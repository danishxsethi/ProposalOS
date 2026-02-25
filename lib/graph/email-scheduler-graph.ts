/**
 * Email Scheduler Graph - LangGraph Orchestrator for Email Sequences
 * 
 * This graph manages the scheduling and sending of email sequences,
 * including branching logic based on recipient engagement.
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import { prisma } from '@/lib/prisma';
import { 
  getNextEmailDecision, 
  processPendingEmailSequences,
  EngagementState 
} from '@/lib/email/sequence-branching';
import { sendProposalEmail } from '@/lib/outreach/emailSender';

export const EmailSchedulerState = Annotation.Root({
  proposalId: Annotation<string>({ reducer: (x, y) => y }),
  tenantId: Annotation<string>({ reducer: (x, y) => y }),
  recipientEmail: Annotation<string>({ reducer: (x, y) => y }),
  currentStep: Annotation<number>({ reducer: (x, y) => y, default: () => 1 }),
  engagementState: Annotation<EngagementState>({ reducer: (x, y) => y, default: () => 'NOT_SENT' }),
  emailToSend: Annotation<{
    subject: string;
    body: string;
    step: number;
  } | null>({ reducer: (x, y) => y, default: () => null }),
  sendResult: Annotation<{
    success: boolean;
    messageId?: string;
    error?: string;
  } | null>({ reducer: (x, y) => y, default: () => null }),
  nextScheduledAt: Annotation<Date | null>({ reducer: (x, y) => y, default: () => null }),
});

/**
 * Fetch pending email sequences and determine next email to send
 */
async function fetch_pending_sequence(state: typeof EmailSchedulerState.State) {
  // Get all proposals with pending email sequences
  const proposals = await prisma.proposal.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      sentAt: { not: null },
      emailSequence: { isNot: null }
    },
    include: {
      emailSequence: true,
    },
    take: 50 // Process up to 50 at a time
  });

  if (proposals.length === 0) {
    return {
      proposalId: '',
      tenantId: '',
      recipientEmail: '',
      emailToSend: null
    };
  }

  // Process first pending proposal
  const proposal = proposals[0];
  const decision = await getNextEmailDecision(proposal.id);

  if (!decision.shouldSend) {
    return {
      proposalId: proposal.id,
      tenantId: proposal.tenantId || '',
      recipientEmail: proposal.prospectEmail || '',
      emailToSend: null,
      engagementState: decision.reason.includes('replied') ? 'REPLIED' : 'DROPPED'
    };
  }

  return {
    proposalId: proposal.id,
    tenantId: proposal.tenantId || '',
    recipientEmail: proposal.prospectEmail || '',
    currentStep: decision.nextStep,
    emailToSend: {
      subject: decision.subject,
      body: decision.body,
      step: decision.nextStep
    }
  };
}

/**
 * Send the determined email
 */
async function send_email(state: typeof EmailSchedulerState.State) {
  if (!state.emailToSend || !state.recipientEmail || !state.proposalId) {
    return {
      sendResult: { success: false, error: 'No email to send' }
    };
  }

  try {
    const result = await sendProposalEmail({
      proposalId: state.proposalId,
      recipientEmail: state.recipientEmail,
      subject: state.emailToSend.subject,
      messageHtml: state.emailToSend.body,
      tenantId: state.tenantId
    });

    // Calculate next scheduled time (based on email step)
    const dayOffsets: Record<number, number> = {
      1: 0, // Same day (Email 1 already sent)
      2: 2, // Day 2
      3: 3, // Day 5 (3 days after email 2)
      4: 3, // Day 8 (3 days after email 3)
      5: 4  // Day 12 (4 days after email 4)
    };

    const nextOffset = dayOffsets[state.currentStep] || 3;
    const nextScheduled = new Date();
    nextScheduled.setDate(nextScheduled.getDate() + nextOffset);

    return {
      sendResult: { success: true, messageId: result.messageId },
      nextScheduledAt: nextScheduled
    };

  } catch (error: any) {
    return {
      sendResult: { 
        success: false, 
        error: error.message || 'Failed to send email' 
      }
    };
  }
}

/**
 * Update tracking and schedule next email
 */
async function update_tracking(state: typeof EmailSchedulerState.State) {
  if (!state.proposalId || !state.sendResult?.success) {
    return {};
  }

  // Update the email sequence status
  const emailSequence = await prisma.emailSequence.findUnique({
    where: { proposalId: state.proposalId }
  });

  if (emailSequence) {
    const emails = emailSequence.emails as Array<{
      step: number;
      subjectA: string;
      subjectB: string;
      body: string;
      status: string;
    }>;
    
    const updatedEmails = emails.map(email => 
      email.step === state.currentStep 
        ? { ...email, status: 'sent' as const }
        : email
    );

    await prisma.emailSequence.update({
      where: { proposalId: state.proposalId },
      data: {
        emails: updatedEmails as any,
        analytics: {
          ...(emailSequence.analytics as object || {}),
          [`step_${state.currentStep}_sent_at`]: new Date().toISOString(),
          last_sent_at: new Date().toISOString()
        }
      }
    });
  }

  // Schedule next email in the sequence
  if (state.nextScheduledAt && state.currentStep < 5) {
    // Could create a scheduled job here
    // For now, we'll rely on cron to check again
  }

  return {};
}

/**
 * Create the email scheduler graph
 */
export const emailSchedulerGraph = new StateGraph(EmailSchedulerState)
  .addNode("fetch_pending_sequence", fetch_pending_sequence)
  .addNode("send_email", send_email)
  .addNode("update_tracking", update_tracking)
  .addConditionalEdges(
    "__start__",
    (state) => state.proposalId ? "fetch_pending_sequence" : "__end__",
    ["fetch_pending_sequence", "__end__"]
  )
  .addEdge("fetch_pending_sequence", "send_email")
  .addEdge("send_email", "update_tracking")
  .addConditionalEdges(
    "update_tracking",
    (state) => state.sendResult?.success ? "__end__" : "__end__",
    ["__end__"]
  )
  .compile();

/**
 * Batch process all pending email sequences
 * This is the main entry point for the cron job
 */
export async function runEmailScheduler(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  // Get all proposals with pending sequences
  const proposals = await prisma.proposal.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      sentAt: { not: null },
      emailSequence: { isNot: null }
    },
    include: {
      emailSequence: true,
    }
  });

  for (const proposal of proposals) {
    try {
      const decision = await getNextEmailDecision(proposal.id);

      if (!decision.shouldSend) {
        continue;
      }

      if (!proposal.prospectEmail) {
        errors.push(`No email address for proposal ${proposal.id}`);
        failed++;
        continue;
      }

      // Send the email
      const result = await sendProposalEmail({
        proposalId: proposal.id,
        recipientEmail: proposal.prospectEmail,
        subject: decision.subject,
        messageHtml: decision.body,
        tenantId: proposal.tenantId || undefined
      });

      if (result.success) {
        sent++;
        
        // Update tracking
        await updateEmailSequenceStatus(proposal.id, decision.nextStep);
      } else {
        failed++;
        errors.push(`Failed to send email for proposal ${proposal.id}`);
      }

    } catch (error: any) {
      failed++;
      errors.push(`Error processing proposal ${proposal.id}: ${error.message}`);
    }
  }

  return {
    processed: proposals.length,
    sent,
    failed,
    errors
  };
}

/**
 * Helper to update email sequence status in database
 */
async function updateEmailSequenceStatus(
  proposalId: string, 
  stepSent: number
): Promise<void> {
  const emailSequence = await prisma.emailSequence.findUnique({
    where: { proposalId }
  });

  if (!emailSequence) return;

  const emails = emailSequence.emails as Array<{
    step: number;
    subjectA: string;
    subjectB: string;
    body: string;
    status: string;
  }>;
  
  const updatedEmails = emails.map(email => 
    email.step === stepSent 
      ? { ...email, status: 'sent' as const }
      : email
  );

  await prisma.emailSequence.update({
    where: { proposalId },
    data: {
      emails: updatedEmails as any
    }
  });
}
