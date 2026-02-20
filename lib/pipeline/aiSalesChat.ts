/**
 * AI Sales Chat — Real-time AI assistant for proposal pages
 * 
 * Handles prospect questions, objections, and purchase intent detection.
 * Responds within 5 seconds, escalates when confidence < 70%.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

import { generateWithGemini } from '@/lib/llm/provider';
import { MODEL_CONFIG } from '@/lib/config/models';
import { prisma } from '@/lib/prisma';
import type {
  ChatContext,
  ChatMessage,
  ObjectionEntry,
  AISalesChat as IAISalesChat,
} from './types';

// ============================================================================
// Default Objection Playbook
// ============================================================================

const DEFAULT_OBJECTION_PLAYBOOK: ObjectionEntry[] = [
  {
    objection: 'too expensive',
    response: 'I understand budget is important. Let me show you the ROI: based on your audit, fixing these issues could increase conversions by 15-30%. Even a 10% lift would pay for this in the first month.',
    category: 'pricing',
  },
  {
    objection: 'need to think about it',
    response: 'Absolutely, this is an important decision. What specific questions can I answer to help you evaluate? I have all your audit data and can walk through any findings.',
    category: 'timing',
  },
  {
    objection: 'already have someone',
    response: 'That\'s great you have support. Our audit found specific gaps that might not be covered. Would you like me to highlight the top 3 issues we found that are costing you customers right now?',
    category: 'competition',
  },
  {
    objection: 'not sure it will work',
    response: 'I get that. The good news is every recommendation is backed by your actual audit data. We\'re not guessing — we found specific issues on your site. Want me to show you the before/after impact for businesses like yours?',
    category: 'skepticism',
  },
  {
    objection: 'too busy',
    response: 'I hear you. The beauty of our approach is you don\'t have to do the work — we handle everything. You just review and approve. Most clients spend less than 2 hours total over the entire project.',
    category: 'time',
  },
];

// ============================================================================
// Intent Detection
// ============================================================================

/**
 * Detects the intent of a prospect's message using keyword matching and LLM classification.
 * 
 * Intent types:
 * - question: General inquiry about findings, services, or process
 * - objection: Concern about price, timing, effectiveness, or competition
 * - purchase_intent: Ready to move forward, asking about next steps
 * - general: Casual conversation or unclear intent
 * 
 * Requirements: 15.4
 */
export async function detectIntent(
  message: string
): Promise<{ intent: 'question' | 'objection' | 'purchase_intent' | 'general'; confidence: number }> {
  const lowerMessage = message.toLowerCase();

  // High-confidence keyword matching for purchase intent
  const purchaseKeywords = [
    'get started',
    'sign up',
    'next step',
    'how do i',
    'ready to',
    'let\'s do',
    'move forward',
    'accept',
    'proceed',
    'buy',
    'purchase',
    'checkout',
  ];

  for (const keyword of purchaseKeywords) {
    if (lowerMessage.includes(keyword)) {
      return { intent: 'purchase_intent', confidence: 0.95 };
    }
  }

  // High-confidence keyword matching for objections
  const objectionKeywords = [
    'too expensive',
    'too much',
    'can\'t afford',
    'not sure',
    'need to think',
    'already have',
    'too busy',
    'not ready',
    'maybe later',
  ];

  for (const keyword of objectionKeywords) {
    if (lowerMessage.includes(keyword)) {
      return { intent: 'objection', confidence: 0.9 };
    }
  }

  // Question keywords
  const questionKeywords = ['what', 'how', 'why', 'when', 'where', 'who', 'can you', 'will you'];
  for (const keyword of questionKeywords) {
    if (lowerMessage.includes(keyword)) {
      return { intent: 'question', confidence: 0.85 };
    }
  }

  // Fallback to LLM classification for ambiguous cases
  try {
    const prompt = `Classify the intent of this message from a prospect viewing a proposal:

Message: "${message}"

Respond with ONLY a JSON object in this format:
{"intent": "question|objection|purchase_intent|general", "confidence": 0.0-1.0}

Intent definitions:
- question: Asking about findings, services, process, or details
- objection: Expressing concern about price, timing, effectiveness, or competition
- purchase_intent: Ready to move forward, asking about next steps or how to proceed
- general: Casual conversation or unclear intent`;

    const result = await generateWithGemini({
      model: MODEL_CONFIG.flash.model,
      input: prompt,
      temperature: 0.2,
      maxOutputTokens: 100,
      metadata: { node: 'intent_detection' }
    });

    const text = result.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: (parsed.intent as 'question' | 'objection' | 'purchase_intent' | 'general') || 'general',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      };
    }
  } catch (error) {
    console.error('[AI Sales Chat] Intent detection error:', error);
  }

  // Default fallback
  return { intent: 'general', confidence: 0.5 };
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Handles a prospect message and generates an AI response.
 * 
 * Uses proposal context (audit findings, tiers, benchmarks) and objection playbook
 * to provide relevant, data-backed responses within 5 seconds.
 * 
 * Requirements: 15.2, 15.3
 */
export async function handleMessage(
  context: ChatContext,
  history: ChatMessage[],
  message: string
): Promise<ChatMessage> {
  const startTime = Date.now();

  // Detect intent
  const { intent, confidence } = await detectIntent(message);

  // Check if we should escalate due to low confidence
  if (shouldEscalate(confidence, { threshold: 0.7 })) {
    return {
      role: 'assistant',
      content: 'That\'s a great question. Let me connect you with a specialist who can give you a detailed answer. Someone from our team will reach out within the next hour.',
      timestamp: new Date(),
      confidence,
      intent,
    };
  }

  // Build context for LLM
  const contextSummary = buildContextSummary(context);
  const conversationHistory = history.slice(-5).map((msg) => `${msg.role}: ${msg.content}`).join('\n');

  // Handle objections with playbook
  if (intent === 'objection') {
    const objectionResponse = findObjectionResponse(message, context.objectionPlaybook);
    if (objectionResponse) {
      return {
        role: 'assistant',
        content: objectionResponse,
        timestamp: new Date(),
        confidence: 0.9,
        intent,
      };
    }
  }

  // Handle purchase intent
  if (intent === 'purchase_intent') {
    return {
      role: 'assistant',
      content: 'Great! I\'m excited to help you get started. You can select a tier below and proceed to checkout, or if you\'d like to discuss the details first, I can schedule a quick call with our team. What works best for you?',
      timestamp: new Date(),
      confidence: 0.95,
      intent,
    };
  }

  // Generate response using LLM
  try {
    const prompt = `You are a helpful sales assistant for a digital marketing agency. A prospect is viewing their website audit proposal and has a question.

CONTEXT:
${contextSummary}

CONVERSATION HISTORY:
${conversationHistory}

PROSPECT MESSAGE: "${message}"

INSTRUCTIONS:
- Answer the question directly and concisely (2-3 sentences max)
- Reference specific audit findings when relevant
- Use data and numbers from the audit to back up your points
- Be friendly and helpful, not pushy
- If discussing pricing, emphasize ROI and value
- Keep it conversational and easy to understand

RESPONSE:`;

    const result = await generateWithGemini({
      model: MODEL_CONFIG.flash.model,
      input: prompt,
      temperature: 0.7,
      maxOutputTokens: 300,
      metadata: { node: 'chat_response' }
    });

    const responseText = result.text || 'I\'m here to help! Could you rephrase your question?';

    const elapsedTime = Date.now() - startTime;

    // Log if response took longer than 5 seconds (requirement 15.2)
    if (elapsedTime > 5000) {
      console.warn(`[AI Sales Chat] Response took ${elapsedTime}ms (>5s threshold)`);
    }

    return {
      role: 'assistant',
      content: responseText.trim(),
      timestamp: new Date(),
      confidence,
      intent,
    };
  } catch (error) {
    console.error('[AI Sales Chat] Error generating response:', error);

    // Fallback response
    return {
      role: 'assistant',
      content: 'I\'m having trouble processing that right now. Let me connect you with someone from our team who can help. They\'ll reach out shortly.',
      timestamp: new Date(),
      confidence: 0.3,
      intent: 'general',
    };
  }
}

// ============================================================================
// Escalation Logic
// ============================================================================

/**
 * Determines if a conversation should be escalated to human review.
 * 
 * Escalates when confidence is below the configured threshold (default: 70%).
 * 
 * Requirements: 15.5
 */
export function shouldEscalate(
  confidence: number,
  config: { threshold: number }
): boolean {
  return confidence < config.threshold;
}

// ============================================================================
// Outcome Recording
// ============================================================================

/**
 * Records the outcome of a chat conversation for learning loop integration.
 * 
 * Tracks conversions, escalations, and objections to improve future responses.
 * 
 * Requirements: 15.6
 */
export async function recordOutcome(
  proposalId: string,
  outcome: 'converted' | 'escalated' | 'abandoned',
  objections: string[]
): Promise<void> {
  try {
    // Find or create chat conversation record
    const conversation = await prisma.chatConversation.findFirst({
      where: { proposalId },
      orderBy: { startedAt: 'desc' },
    });

    if (conversation) {
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          outcome,
          objections,
          completedAt: new Date(),
        },
      });
    } else {
      // Create a new conversation record if none exists
      const proposal = await prisma.proposal.findUnique({
        where: { id: proposalId },
        select: { tenantId: true },
      });

      if (proposal && proposal.tenantId) {
        await prisma.chatConversation.create({
          data: {
            tenantId: proposal.tenantId,
            proposalId,
            sessionId: `session-${Date.now()}`,
            outcome,
            objections,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        });
      }
    }

    // Log for learning loop
    console.log(`[AI Sales Chat] Recorded outcome: ${outcome} for proposal ${proposalId}, objections: ${objections.join(', ')}`);
  } catch (error) {
    console.error('[AI Sales Chat] Error recording outcome:', error);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds a concise context summary for the LLM prompt.
 */
function buildContextSummary(context: ChatContext): string {
  const { auditFindings, proposalTiers, industryBenchmarks } = context;

  // Top 3 findings
  const topFindings = auditFindings
    .slice(0, 3)
    .map((f: any) => `- ${f.title || f.module}: ${f.description || 'Issue found'}`)
    .join('\n');

  // Tier pricing
  const tiers = [
    `Essentials: $${proposalTiers.essentials?.price || 'N/A'}`,
    `Growth: $${proposalTiers.growth?.price || 'N/A'}`,
    `Premium: $${proposalTiers.premium?.price || 'N/A'}`,
  ].join(', ');

  // Benchmarks
  const benchmarkSummary = Object.entries(industryBenchmarks)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  return `AUDIT FINDINGS (Top 3):
${topFindings}

PRICING TIERS: ${tiers}

INDUSTRY BENCHMARKS: ${benchmarkSummary}`;
}

/**
 * Finds a matching objection response from the playbook.
 */
function findObjectionResponse(
  message: string,
  playbook: ObjectionEntry[]
): string | null {
  const lowerMessage = message.toLowerCase();

  // Merge default playbook with custom playbook
  const fullPlaybook = [...DEFAULT_OBJECTION_PLAYBOOK, ...playbook];

  for (const entry of fullPlaybook) {
    if (lowerMessage.includes(entry.objection.toLowerCase())) {
      return entry.response;
    }
  }

  return null;
}

// ============================================================================
// Export Implementation
// ============================================================================

export const aiSalesChat: IAISalesChat = {
  handleMessage,
  detectIntent,
  shouldEscalate,
  recordOutcome,
};
