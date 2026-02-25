/**
 * Competitor Monitor
 * 
 * Detects competitor changes and triggers upsell proposals
 * when significant changes are detected.
 */

import { prisma } from '@/lib/prisma';
import { generateWithGemini } from '@/lib/llm/provider';
import { sendProposalEmail } from '@/lib/outreach/emailSender';

export type CompetitorSignalType = 
  | 'competitor_new_review'
  | 'competitor_rating_change'
  | 'competitor_website_update'
  | 'competitor_new_listing';

export interface CompetitorSignalData {
  competitorName: string;
  competitorUrl?: string;
  changeType: CompetitorSignalType;
  oldValue?: string | number;
  newValue?: string | number;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Check for competitor changes for a client's industry/location
 * This would typically integrate with external APIs (Google Places, Yelp, etc.)
 */
export async function checkCompetitorChanges(
  tenantId: string,
  businessIndustry: string,
  businessCity?: string
): Promise<CompetitorSignalData[]> {
  const signals: CompetitorSignalData[] = [];

  // In a real implementation, this would:
  // 1. Query external APIs for competitor reviews/ratings
  // 2. Check for website changes (scraping or API)
  // 3. Monitor new listings

  // For now, we'll create a placeholder that could be expanded
  // The actual implementation would depend on available data sources

  // Placeholder: In production, integrate with:
  // - Google Places API (reviews, ratings)
  // - Yelp API
  // - Website change detection services
  // - Social listening tools

  return signals;
}

/**
 * Process competitor signals and trigger upsell proposals
 */
export async function processCompetitorSignals(): Promise<{
  signalsDetected: number;
  upsellsTriggered: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let signalsDetected = 0;
  let upsellsTriggered = 0;

  // Get all accepted proposals with their industries
  const acceptedProposals = await prisma.proposal.findMany({
    where: { status: 'ACCEPTED' },
    include: {
      audit: true,
      tenant: true
    }
  });

  for (const proposal of acceptedProposals) {
    try {
      const industry = proposal.audit?.businessIndustry;
      const city = proposal.audit?.businessCity;

      if (!industry || !proposal.tenantId) continue;

      // Check for competitor changes
      const signals = await checkCompetitorChanges(
        proposal.tenantId,
        industry,
        city || undefined
      );

      if (signals.length > 0) {
        signalsDetected += signals.length;

        // Save signals to database
        for (const signal of signals) {
          await prisma.competitorSignal.create({
            data: {
              tenantId: proposal.tenantId,
              leadId: undefined, // Could link to prospect if applicable
              signalType: signal.changeType,
              priority: signal.severity,
              competitorName: signal.competitorName,
              competitorUrl: signal.competitorUrl,
              signalData: signal as any
            }
          });

          // If high severity, trigger upsell proposal
          if (signal.severity === 'high') {
            const upsellResult = await triggerUpsellProposal(proposal, signal);
            if (upsellResult) {
              upsellsTriggered++;
            }
          }
        }
      }

    } catch (error: any) {
      errors.push(`Error processing proposal ${proposal.id}: ${error.message}`);
    }
  }

  return {
    signalsDetected,
    upsellsTriggered,
    errors
  };
}

/**
 * Trigger an upsell proposal based on competitor signal
 */
async function triggerUpsellProposal(
  proposal: any,
  signal: CompetitorSignalData
): Promise<boolean> {
  // Generate upsell email content
  const upsellContent = await generateUpsellContent(proposal, signal);

  if (!proposal.prospectEmail) {
    return false;
  }

  try {
    // Send upsell proposal
    await sendProposalEmail({
      proposalId: proposal.id,
      recipientEmail: proposal.prospectEmail,
      subject: upsellContent.subject,
      messageHtml: upsellContent.body,
      tenantId: proposal.tenantId
    });

    // Update signal record
    await prisma.competitorSignal.updateMany({
      where: {
        tenantId: proposal.tenantId,
        competitorName: signal.competitorName,
        signalData: { path: ['changeType'], equals: signal.changeType },
        outreachTriggered: false
      },
      data: {
        outreachTriggered: true,
        upsellProposalId: proposal.id
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to send upsell proposal:', error);
    return false;
  }
}

/**
 * Generate upsell content based on competitor signal
 */
async function generateUpsellContent(
  proposal: any,
  signal: CompetitorSignalData
): Promise<{ subject: string; body: string }> {
  const businessName = proposal.audit?.businessName || 'your business';
  
  const prompt = `You are writing a brief, professional upsell email to an existing client.

Context:
- Client: ${businessName}
- Industry: ${proposal.audit?.businessIndustry || 'their industry'}
- Their current proposal is already accepted

Competitor Signal Detected:
- Competitor: ${signal.competitorName}
- Change: ${signal.description}
- Severity: ${signal.severity}

Write a brief email (under 150 words) that:
1. Notes the positive development for the competitor
2. Positions it as a reason to enhance their own implementation
3. Offers additional services or an upgraded package
4. Has a soft CTA to discuss options

Return format:
SUBJECT: (short subject line)
BODY: (email body)

Do NOT use JSON.`;

  const result = await generateWithGemini({
    model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.0-flash',
    input: prompt,
    temperature: 0.5,
    maxOutputTokens: 500,
  });

  const text = result.text || '';
  
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

  const subject = subjectMatch?.[1]?.trim() || 
    `Opportunity: ${signal.competitorName} just improved`;
  const body = bodyMatch?.[1]?.trim() || 
    `Hi,\n\nI noticed that ${signal.competitorName} just ${signal.description.toLowerCase()}.\n\nThis is actually great news for you — it means the market is validating the importance of this area.\n\nGiven your current implementation, I'd love to discuss how we can ensure you're staying ahead. Would you be open to a quick call to explore some enhancements?\n\nBest regards`;

  return { subject, body };
}

/**
 * Get pending upsell signals for manual review
 */
export async function getPendingUpsellSignals(tenantId: string) {
  return await prisma.competitorSignal.findMany({
    where: {
      tenantId,
      outreachTriggered: false,
      priority: { in: ['high', 'medium'] }
    },
    orderBy: { detectedAt: 'desc' },
    take: 50
  });
}
