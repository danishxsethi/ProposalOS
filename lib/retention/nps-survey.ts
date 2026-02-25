/**
 * NPS Survey System
 * 
 * Handles automated Net Promoter Score surveys at Day 30 and Day 90
 * post-proposal acceptance.
 */

import { prisma } from '@/lib/prisma';
import { generateWithGemini } from '@/lib/llm/provider';
import { sendProposalEmail } from '@/lib/outreach/emailSender';

export type NPSSurveyType = 'DAY_30' | 'DAY_90';

export interface NPSSurveyResult {
  id: string;
  proposalId: string;
  tenantId: string;
  surveyType: NPSSurveyType;
  score: number | null; // 0-10 scale
  feedback: string | null;
  sentAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
}

/**
 * Generate an NPS survey email
 */
export async function generateNPSSurveyEmail(
  proposalId: string,
  surveyType: NPSSurveyType,
  businessName: string,
  recipientEmail: string
): Promise<{ subject: string; body: string }> {
  
  const surveyQuestions = surveyType === 'DAY_30'
    ? "On a scale of 0-10, how satisfied are you with our audit and proposal process?"
    : "Now that you've had time to implement (or consider) our recommendations, how likely are you to recommend our services to others?";

  const context = surveyType === 'DAY_30'
    ? "It's been about 30 days since you received our audit report. We'd love to hear about your experience."
    : "It's been about 90 days since our initial audit. We'd like to follow up on your progress and get your feedback.";

  const prompt = `You are writing a brief, professional NPS (Net Promoter Score) survey email.

Business Name: ${businessName}
Survey Type: ${surveyType === 'DAY_30' ? '30-Day Early Check-in' : '90-Day Post-Implementation Check-in'}

${context}

The survey question: "${surveyQuestions}"

Write a very brief email (under 100 words total) that:
1. Thanks them briefly
2. Asks the NPS question with a link to respond (use [SURVEY_LINK] as placeholder)
3. Offers to help with any questions
4. Uses a warm, professional tone

Return in this exact format:
SUBJECT: (short subject line, under 50 chars)
BODY:
(email body here)

Do NOT use JSON. Use plain text.`;

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
    (surveyType === 'DAY_30' 
      ? "Quick question about your experience" 
      : "How are things going?");
  
  const body = bodyMatch?.[1]?.trim() || 
    `${context}\n\n${surveyQuestions}\n\nPlease take a moment to share your feedback: [SURVEY_LINK]\n\nThank you!`;

  return { subject, body };
}

/**
 * Send NPS survey to a proposal
 */
export async function sendNPSSurvey(
  proposalId: string,
  surveyType: NPSSurveyType
): Promise<{ success: boolean; error?: string }> {
  
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      audit: true,
      tenant: true
    }
  });

  if (!proposal) {
    return { success: false, error: 'Proposal not found' };
  }

  if (!proposal.prospectEmail) {
    return { success: false, error: 'No prospect email found' };
  }

  // Check if survey was already sent recently
  const existingSurvey = await prisma.nPSSurvey.findFirst({
    where: {
      proposalId,
      surveyType,
      sentAt: { not: null }
    }
  });

  if (existingSurvey) {
    return { success: false, error: `Survey already sent on ${existingSurvey.sentAt}` };
  }

  const businessName = proposal.audit?.businessName || 'your business';
  
  const { subject, body } = await generateNPSSurveyEmail(
    proposalId,
    surveyType,
    businessName,
    proposal.prospectEmail
  );

  // Generate a unique survey link (you would integrate with a survey tool like Typeform)
  const surveyToken = `${proposalId}-${surveyType.toLowerCase()}-${Date.now()}`;
  const surveyLink = `${process.env.NEXT_PUBLIC_APP_URL}/survey/${surveyToken}`;
  
  const personalizedBody = body.replace(/\[SURVEY_LINK\]/g, surveyLink);

  try {
    // Send the email
    await sendProposalEmail({
      proposalId,
      recipientEmail: proposal.prospectEmail,
      subject: subject,
      messageHtml: personalizedBody,
      tenantId: proposal.tenantId || undefined
    });

    // Create survey record
    await prisma.nPSSurvey.create({
      data: {
        proposalId,
        tenantId: proposal.tenantId || '',
        surveyType,
        sentAt: new Date(),
        surveyToken
      }
    });

    return { success: true };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process all pending NPS surveys
 * Should be called by cron job
 */
export async function processPendingNPSSurveys(): Promise<{
  day30Processed: number;
  day90Processed: number;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let day30Processed = 0;
  let day90Processed = 0;
  let sent = 0;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Find proposals that need Day 30 surveys
  const day30Proposals = await prisma.proposal.findMany({
    where: {
      status: 'ACCEPTED',
      closedAt: {
        gte: thirtyDaysAgo,
        lt: new Date(thirtyDaysAgo.getTime() + 24 * 60 * 60 * 1000) // Within 1 day window
      }
    },
    include: {
      nPSSurveys: true
    }
  });

  // Find proposals that need Day 90 surveys
  const day90Proposals = await prisma.proposal.findMany({
    where: {
      status: 'ACCEPTED',
      closedAt: {
        gte: ninetyDaysAgo,
        lt: new Date(ninetyDaysAgo.getTime() + 24 * 60 * 60 * 1000) // Within 1 day window
      }
    },
    include: {
      nPSSurveys: true
    }
  });

  // Process Day 30 surveys
  for (const proposal of day30Proposals) {
    const hasDay30Survey = proposal.nPSSurveys.some(s => s.surveyType === 'DAY_30');
    
    if (!hasDay30Survey) {
      const result = await sendNPSSurvey(proposal.id, 'DAY_30');
      if (result.success) {
        sent++;
        day30Processed++;
      } else {
        errors.push(`Day 30 survey failed for proposal ${proposal.id}: ${result.error}`);
      }
    }
  }

  // Process Day 90 surveys
  for (const proposal of day90Proposals) {
    const hasDay90Survey = proposal.nPSSurveys.some(s => s.surveyType === 'DAY_90');
    
    if (!hasDay90Survey) {
      const result = await sendNPSSurvey(proposal.id, 'DAY_90');
      if (result.success) {
        sent++;
        day90Processed++;
      } else {
        errors.push(`Day 90 survey failed for proposal ${proposal.id}: ${result.error}`);
      }
    }
  }

  return {
    day30Processed,
    day90Processed,
    sent,
    errors
  };
}

/**
 * Record an NPS survey response
 */
export async function recordNPSResponse(
  proposalId: string,
  score: number,
  feedback?: string
): Promise<{ success: boolean; error?: string }> {
  
  // Find the pending survey
  const survey = await prisma.nPSSurvey.findFirst({
    where: {
      proposalId,
      respondedAt: null,
      sentAt: { not: null }
    },
    orderBy: { sentAt: 'desc' }
  });

  if (!survey) {
    return { success: false, error: 'No pending survey found' };
  }

  // Validate score
  if (score < 0 || score > 10) {
    return { success: false, error: 'Score must be between 0 and 10' };
  }

  // Update survey with response
  await prisma.nPSSurvey.update({
    where: { id: survey.id },
    data: {
      score,
      feedback: feedback || null,
      respondedAt: new Date()
    }
  });

  // Determine follow-up action based on score
  const category = score >= 9 ? 'PROMOTER' : score >= 7 ? 'PASSIVE' : 'DETRACTOR';
  
  // Log the NPS result for analytics
  console.log(`NPS Survey Response: Proposal ${proposalId}, Score ${score}, Category ${category}`);

  // If detractor, flag for manager review
  if (score <= 6) {
    // Could trigger additional follow-up logic here
    console.log(`Detractor NPS score for proposal ${proposalId} - flag for follow-up`);
  }

  return { success: true };
}
