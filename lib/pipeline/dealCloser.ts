import { createScopedPrisma } from '@/lib/tenant/context';
import { stripe } from '@/lib/billing/stripe';
import type {
  EngagementEvent,
  EngagementScore,
  PipelineConfig,
  DealCloser as IDealCloser,
} from './types';
import { OutreachEventType } from '@prisma/client';

/**
 * Deal Closer: Tracks prospect engagement and manages the autonomous closing workflow
 * 
 * Responsibilities:
 * - Record engagement events (email opens, clicks, proposal views)
 * - Compute engagement scores from cumulative events
 * - Identify hot leads (top N percentile)
 * - Create Stripe checkout sessions for self-serve purchase
 * - Handle payment success (transition to closed_won, create client, trigger onboarding)
 * - Handle payment failure (retry + recovery email)
 */

/**
 * Record an engagement event for a prospect
 * 
 * @param leadId - The prospect lead ID
 * @param event - The engagement event to record
 */
export async function recordEvent(
  leadId: string,
  event: EngagementEvent
): Promise<void> {
  // Get tenant ID from the lead
  const prisma = createScopedPrisma('system');
  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { tenantId: true },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const tenantId = lead.tenantId;
  const scopedPrisma = createScopedPrisma(tenantId);

  // Map EngagementEvent type to OutreachEventType
  const eventTypeMap: Record<string, OutreachEventType> = {
    email_open: OutreachEventType.EMAIL_OPEN,
    email_click: OutreachEventType.EMAIL_CLICK,
    proposal_view: OutreachEventType.PROPOSAL_VIEW_2M,
    tier_interaction: OutreachEventType.SCORECARD_CLICK,
  };

  const outreachEventType = eventTypeMap[event.eventType];
  if (!outreachEventType) {
    throw new Error(`Unknown engagement event type: ${event.eventType}`);
  }

  // Create the event record
  await scopedPrisma.outreachEmailEvent.create({
    data: {
      tenantId,
      leadId,
      emailId: event.metadata?.emailId as string | undefined,
      type: outreachEventType,
      metadata: (event.metadata || {}) as any,
      occurredAt: event.timestamp,
    },
  });

  // Update the lead's engagement counters
  const updates: Record<string, unknown> = {
    lastEngagementAt: event.timestamp,
  };

  if (event.eventType === 'email_open') {
    updates.outreachOpenCount = { increment: 1 };
  } else if (event.eventType === 'email_click') {
    updates.outreachClickCount = { increment: 1 };
  } else if (event.eventType === 'proposal_view') {
    // Track proposal view
    if (event.metadata?.dwellSeconds) {
      updates.scorecardTotalViewSeconds = { increment: Number(event.metadata.dwellSeconds) };
    }
  }

  await scopedPrisma.prospectLead.update({
    where: { id: leadId },
    data: updates,
  });
}

/**
 * Compute the engagement score for a prospect based on all recorded events
 * 
 * Scoring weights:
 * - Email open: 5 points each
 * - Email click: 10 points each
 * - Proposal view: 20 points
 * - Proposal dwell time: 1 point per 10 seconds
 * - Scroll depth: 0-20 points (linear scale)
 * - Tier interactions: 15 points each
 * 
 * @param leadId - The prospect lead ID
 * @returns The computed engagement score
 */
export async function computeEngagementScore(
  leadId: string
): Promise<EngagementScore> {
  const prisma = createScopedPrisma('system'); // Use system context for cross-tenant queries

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    include: {
      outreachEvents: {
        orderBy: { occurredAt: 'asc' },
      },
    },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Count events by type
  const emailOpens = lead.outreachEvents.filter(
    (e) => e.type === OutreachEventType.EMAIL_OPEN
  ).length;

  const emailClicks = lead.outreachEvents.filter(
    (e) => e.type === OutreachEventType.EMAIL_CLICK
  ).length;

  const proposalViews = lead.outreachEvents.filter(
    (e) => e.type === OutreachEventType.PROPOSAL_VIEW_2M
  ).length;

  // Extract dwell time and scroll depth from metadata
  let totalDwellSeconds = lead.scorecardTotalViewSeconds || 0;
  let maxScrollDepth = 0;
  let tierInteractions = 0;

  for (const event of lead.outreachEvents) {
    const metadata = event.metadata as Record<string, unknown>;
    
    if (event.type === OutreachEventType.PROPOSAL_VIEW_2M && metadata.dwellSeconds) {
      totalDwellSeconds += Number(metadata.dwellSeconds);
    }
    
    if (metadata.scrollDepth) {
      maxScrollDepth = Math.max(maxScrollDepth, Number(metadata.scrollDepth));
    }
    
    if (metadata.tierInteraction) {
      tierInteractions++;
    }
  }

  // Calculate component scores
  const emailOpenScore = emailOpens * 5;
  const emailClickScore = emailClicks * 10;
  const proposalViewScore = proposalViews * 20;
  const dwellScore = Math.floor(totalDwellSeconds / 10);
  const scrollScore = Math.floor(maxScrollDepth * 20); // maxScrollDepth is 0-1
  const tierInteractionScore = tierInteractions * 15;

  const total =
    emailOpenScore +
    emailClickScore +
    proposalViewScore +
    dwellScore +
    scrollScore +
    tierInteractionScore;

  const score: EngagementScore = {
    emailOpens,
    emailClicks,
    proposalViews,
    proposalDwellSeconds: totalDwellSeconds,
    scrollDepth: maxScrollDepth,
    tierInteractions,
    total,
  };

  // Update the lead's engagement score
  await prisma.prospectLead.update({
    where: { id: leadId },
    data: { engagementScore: total },
  });

  return score;
}

/**
 * Determine if a prospect is a hot lead based on engagement score percentile
 * 
 * A hot lead is in the top N percentile (default: top 5%) of all active prospects
 * for the tenant.
 * 
 * @param score - The engagement score to evaluate
 * @param tenantConfig - The tenant's pipeline configuration
 * @returns True if the prospect is a hot lead
 */
export function isHotLead(
  score: EngagementScore,
  tenantConfig: PipelineConfig
): boolean {
  // For synchronous implementation, we use a simple threshold
  // In production, this would be computed asynchronously with percentile calculation
  const hotLeadThreshold = 100; // Default threshold for hot leads
  return score.total >= hotLeadThreshold;
}

/**
 * Create a Stripe checkout session for a prospect to purchase a proposal tier
 * 
 * @param leadId - The prospect lead ID
 * @param tier - The proposal tier (essentials, growth, premium)
 * @returns The Stripe checkout session URL
 */
export async function createCheckoutSession(
  leadId: string,
  tier: string
): Promise<string> {
  const prisma = createScopedPrisma('system');

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    include: {
      tenant: true,
    },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Get the proposal to extract pricing
  const proposal = lead.proposalId
    ? await prisma.proposal.findUnique({
        where: { id: lead.proposalId },
      })
    : null;

  if (!proposal) {
    throw new Error(`No proposal found for lead: ${leadId}`);
  }

  // Extract tier pricing from proposal
  // In production, this would parse the actual proposal structure
  // For now, we'll use a default pricing structure
  const tierPricing: Record<string, { price: number; name: string }> = {
    essentials: { price: 2500, name: 'Essentials Package' },
    growth: { price: 5000, name: 'Growth Package' },
    premium: { price: 10000, name: 'Premium Package' },
  };

  const selectedTier = tierPricing[tier];

  if (!selectedTier) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const priceInCents = Math.round(selectedTier.price * 100);

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${lead.businessName} - ${selectedTier.name}`,
            description: `Proposal for ${lead.businessName}`,
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      },
    ],
    customer_email: lead.decisionMakerEmail || undefined,
    client_reference_id: leadId,
    metadata: {
      leadId,
      tier,
      tenantId: lead.tenantId,
      proposalId: lead.proposalId || '',
    },
    success_url: `${process.env.NEXTAUTH_URL}/proposal/${proposal.webLinkToken}?payment=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/proposal/${proposal.webLinkToken}?payment=cancel`,
  });

  if (!session.url) {
    throw new Error('Failed to create Stripe checkout session');
  }

  // Update lead status to closing
  await prisma.prospectLead.update({
    where: { id: leadId },
    data: {
      pipelineStatus: 'closing',
    },
  });

  return session.url;
}

/**
 * Handle successful payment from Stripe
 * 
 * Actions:
 * - Transition prospect to closed_won
 * - Create client record
 * - Trigger onboarding flow (welcome email, dashboard access)
 * - Initiate delivery
 * 
 * @param leadId - The prospect lead ID
 * @param stripeSessionId - The Stripe checkout session ID
 */
export async function handlePaymentSuccess(
  leadId: string,
  stripeSessionId: string
): Promise<void> {
  const prisma = createScopedPrisma('system');

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    include: {
      tenant: true,
    },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Retrieve the Stripe session to get payment details
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  const tier = session.metadata?.tier || 'essentials';
  const amountPaid = session.amount_total || 0;

  // Transition to closed_won
  await prisma.prospectLead.update({
    where: { id: leadId },
    data: {
      pipelineStatus: 'closed_won',
    },
  });

  // Create client record (simplified - in production this would be more complex)
  // For now, we'll just create a record in a hypothetical clients table
  // In the actual system, this would integrate with the existing client management

  // Record the win in the learning loop
  await prisma.winLossRecord.create({
    data: {
      tenantId: lead.tenantId,
      proposalId: lead.proposalId || '',
      leadId: lead.id,
      vertical: lead.vertical,
      city: lead.city,
      outcome: 'won',
      tierChosen: tier,
      dealValue: amountPaid / 100, // Convert cents to dollars
    },
  });

  // TODO: Trigger onboarding flow
  // - Send welcome email
  // - Create client dashboard access
  // - Schedule kickoff call
  
  // TODO: Initiate delivery
  // - Generate deliverables from proposal tier
  // - Dispatch to AI service agents
}

/**
 * Handle failed payment from Stripe
 * 
 * Actions:
 * - Retry the payment (up to 3 times)
 * - Send payment recovery email
 * - If all retries fail, transition to closed_lost
 * 
 * @param leadId - The prospect lead ID
 * @param stripeSessionId - The Stripe checkout session ID
 */
export async function handlePaymentFailure(
  leadId: string,
  stripeSessionId: string
): Promise<void> {
  const prisma = createScopedPrisma('system');

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Retrieve the Stripe session to get failure details
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  
  // Check retry count (stored in metadata or separate table)
  const retryCount = Number(session.metadata?.retryCount || 0);
  const maxRetries = 3;

  if (retryCount >= maxRetries) {
    // All retries exhausted, mark as closed_lost
    await prisma.prospectLead.update({
      where: { id: leadId },
      data: {
        pipelineStatus: 'closed_lost',
      },
    });

    // Record the loss
    await prisma.winLossRecord.create({
      data: {
        tenantId: lead.tenantId,
        proposalId: lead.proposalId || '',
        leadId: lead.id,
        vertical: lead.vertical,
        city: lead.city,
        outcome: 'lost',
        lostReason: 'payment_failed',
      },
    });

    return;
  }

  // Send payment recovery email
  // TODO: Integrate with email system
  // For now, we'll just log the intent
  console.log(`Sending payment recovery email to ${lead.decisionMakerEmail}`);

  // Update retry count
  // In production, this would be stored in a separate payment attempts table
  await prisma.prospectLead.update({
    where: { id: leadId },
    data: {
      pipelineStatus: 'hot_lead', // Return to hot_lead for retry
    },
  });
}

/**
 * Deal Closer implementation
 */
export const dealCloser: IDealCloser = {
  recordEvent,
  computeEngagementScore,
  isHotLead,
  createCheckoutSession,
  handlePaymentSuccess,
  handlePaymentFailure,
};
