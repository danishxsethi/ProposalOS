/**
 * API endpoint for AI Sales Chat
 * 
 * Handles real-time chat messages on proposal pages.
 * POST /api/pipeline/chat - Send a message and get AI response
 * 
 * Requirements: 15.1, 15.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleMessage } from '@/lib/pipeline/aiSalesChat';
import type { ChatMessage, ChatContext } from '@/lib/pipeline/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatRequest {
  proposalId: string;
  message: string;
  sessionId: string;
  history?: ChatMessage[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { proposalId, message, sessionId, history = [] } = body;

    // Validate input
    if (!proposalId || !message || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: proposalId, message, sessionId' },
        { status: 400 }
      );
    }

    // Fetch proposal with audit findings and tiers
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        audit: {
          include: {
            findings: {
              take: 10, // Top 10 findings for context
              orderBy: { impactScore: 'desc' },
            },
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      );
    }

    // Extract tier information from proposal
    // In production, this would parse the actual proposal structure
    const proposalTiers = {
      essentials: { price: 2500, name: 'Essentials' },
      growth: { price: 5000, name: 'Growth' },
      premium: { price: 10000, name: 'Premium' },
    };

    // Get industry benchmarks (simplified - in production would fetch from database)
    const industryBenchmarks = {
      avgPageSpeed: 75,
      avgMobileScore: 80,
      avgSeoScore: 70,
    };

    // Build chat context
    const context: ChatContext = {
      proposalId,
      auditFindings: proposal.audit.findings,
      proposalTiers,
      industryBenchmarks,
      objectionPlaybook: [], // Use default playbook from aiSalesChat
      tenantBranding: {
        name: 'Our Team',
        brandName: 'Our Team',
      },
    };

    // Add prospect message to history
    const prospectMessage: ChatMessage = {
      role: 'prospect',
      content: message,
      timestamp: new Date(),
    };

    const fullHistory = [...history, prospectMessage];

    // Generate AI response
    const response = await handleMessage(context, history, message);

    // Store conversation in database
    await storeConversation(proposalId, sessionId, fullHistory, response, proposal.audit.tenantId);

    // Return response
    return NextResponse.json({
      message: response,
      sessionId,
    });
  } catch (error) {
    console.error('[Chat API] Error:', error);
    
    // Return a graceful error response
    return NextResponse.json(
      {
        error: 'Failed to process message',
        message: {
          role: 'assistant',
          content: 'I\'m having trouble right now. Let me connect you with someone from our team who can help.',
          timestamp: new Date(),
          confidence: 0.3,
          intent: 'general',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Stores the conversation in the database for learning loop integration
 */
async function storeConversation(
  proposalId: string,
  sessionId: string,
  history: ChatMessage[],
  response: ChatMessage,
  tenantId: string
): Promise<void> {
  try {
    // Find or create conversation
    const existingConversation = await prisma.chatConversation.findFirst({
      where: {
        proposalId,
        sessionId,
      },
    });

    const messages = [...history, response];

    if (existingConversation) {
      // Update existing conversation
      await prisma.chatConversation.update({
        where: { id: existingConversation.id },
        data: {
          messages: messages as any,
        },
      });
    } else {
      // Create new conversation
      await prisma.chatConversation.create({
        data: {
          tenantId,
          proposalId,
          sessionId,
          messages: messages as any,
          startedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error('[Chat API] Error storing conversation:', error);
    // Don't throw - conversation storage is non-critical
  }
}
