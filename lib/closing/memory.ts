import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface ChatMessage {
    role: 'user' | 'agent' | 'system';
    text: string;
    timestamp: string;
}

export class ConversationMemory {
    /**
     * Retrieves or initializes the chat session persistence logic for a Proposal.
     */
    static async getOrCreateSession(proposalId: string, sessionId: string) {
        let state = await prisma.conversationState.findUnique({
            where: { proposalId }
        });

        if (!state) {
            state = await prisma.conversationState.create({
                data: {
                    proposalId,
                    sessionId: sessionId || 'anonymous',
                    history: [],
                    objectionsRaised: [],
                }
            });
        }
        return state;
    }

    /**
     * Appends a new user or agent message directly onto the persistent state cache.
     */
    static async addMessage(proposalId: string, message: ChatMessage) {
        const state = await prisma.conversationState.findUnique({
            where: { proposalId }
        });
        if (!state) throw new Error("Conversation state not found.");

        const history = (state.history as Prisma.JsonArray) || [];
        history.push(message as unknown as Prisma.JsonObject);

        return await prisma.conversationState.update({
            where: { proposalId },
            data: {
                history: history,
                questionsAsked: message.role === 'user' && message.text.includes('?')
                    ? { increment: 1 }
                    : undefined,
            }
        });
    }

    /**
     * Caches structured objection classification mapping back to the underlying `ObjectionLog` schema.
     */
    static async logObjection(proposalId: string, category: string, prospectText: string, agentResponse: string, escalated: boolean = false) {
        await prisma.objectionLog.create({
            data: {
                proposalId,
                category,
                prospectText,
                agentResponse,
                escalated
            }
        });

        await prisma.conversationState.update({
            where: { proposalId },
            data: {
                objectionsRaised: { push: category },
                escalated: escalated ? true : undefined
            }
        });
    }

    /**
     * Tracks overall trajectory of the prospect engagement on a -1.0 to 1.0 interval.
     */
    static async updateSentiment(proposalId: string, delta: number) {
        const state = await prisma.conversationState.findUnique({
            where: { proposalId }
        });
        if (!state) return;

        let newScore = state.sentimentScore + delta;
        newScore = Math.max(-1.0, Math.min(1.0, newScore)); // Clamp between -1 and 1

        return await prisma.conversationState.update({
            where: { proposalId },
            data: {
                sentimentScore: newScore,
                engagementScore: { increment: 1 }
            }
        });
    }
}
