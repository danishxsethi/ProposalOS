/**
 * Property-based tests for the AI Closing Agent
 *
 * Tests robustness across edge cases and validates system properties.
 */

import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';

import { runClosingAgent } from '../agent';
import { ConversationMemory } from '../memory';

import type { MockInstance } from 'vitest';

// Mock the dependencies
vi.mock('@/lib/prisma', () => {
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();
  const mockUpsert = vi.fn();

  return {
    prisma: {
      proposal: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
      conversationState: {
        findUnique: vi.fn(),
        upsert: mockUpsert,
      },
    },
  };
});

vi.mock('../memory', () => {
  const mockGetOrCreateSession = vi.fn();
  const mockAddMessage = vi.fn();

  return {
    ConversationMemory: {
      getOrCreateSession: mockGetOrCreateSession,
      addMessage: mockAddMessage,
    },
  };
});

vi.mock('@/lib/llm/provider', () => ({
  generateWithGemini: vi.fn().mockResolvedValue({ text: 'Test response' }),
}));

describe('Closing Agent - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle arbitrary user input without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (userMessage, proposalId, sessionId) => {
          // Setup mock data
          const mockProposal = {
            id: proposalId,
            webLinkToken: sessionId,
            audit: {
              findings: [],
              tenantId: 'test-tenant',
            },
          };

          (prisma.proposal.findUnique as any).mockResolvedValue(mockProposal);
          (ConversationMemory.getOrCreateSession as any).mockResolvedValue({});
          (ConversationMemory.addMessage as any).mockResolvedValue({
            history: [],
            sentimentScore: 0.5,
            escalated: false,
          });

          // Execute the agent
          const result = await runClosingAgent(
            proposalId,
            sessionId,
            'Test Business',
            'Test context',
            userMessage
          );

          // Assertions
          expect(result).toHaveProperty('reply');
          expect(result).toHaveProperty('escalated');
          expect(result).toHaveProperty('sentiment');
        }
      )
    );
  });

  it('should maintain bounded sentiment scores', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.integer({ min: -100, max: 100 }),
        async (message, initialSentiment) => {
          const mockProposal = {
            id: 'test-proposal',
            webLinkToken: 'test-session',
            audit: {
              findings: [],
              tenantId: 'test-tenant',
            },
          };

          (prisma.proposal.findUnique as vi.Mock).mockResolvedValue(mockProposal);
          (ConversationMemory.getOrCreateSession as vi.Mock).mockResolvedValue({});
          (ConversationMemory.addMessage as vi.Mock).mockResolvedValue({
            history: [],
            sentimentScore: Math.max(-1, Math.min(1, initialSentiment / 100)),
            escalated: false,
          });

          const result = await runClosingAgent(
            'test-proposal',
            'test-session',
            'Test Business',
            'Test context',
            message
          );

          // Sentiment should be between -1 and 1
          expect(result.sentiment).toBeGreaterThanOrEqual(-1);
          expect(result.sentiment).toBeLessThanOrEqual(1);
        }
      )
    );
  });

  it('should handle concurrent sessions safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 100 }),
            sessionId: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionInputs) => {
          const mockProposal = {
            id: 'test-proposal',
            webLinkToken: 'test-session',
            audit: {
              findings: [],
              tenantId: 'test-tenant',
            },
          };

          (prisma.proposal.findUnique as vi.Mock).mockResolvedValue(mockProposal);
          (ConversationMemory.getOrCreateSession as vi.Mock).mockResolvedValue({});
          (ConversationMemory.addMessage as vi.Mock).mockResolvedValue({
            history: [],
            sentimentScore: 0.5,
            escalated: false,
          });

          // Execute multiple concurrent sessions
          const promises = sessionInputs.map(({ message, sessionId }) =>
            runClosingAgent('test-proposal', sessionId, 'Test Business', 'Test context', message)
          );

          const results = await Promise.allSettled(promises);

          // All should complete successfully
          results.forEach((result) => {
            if (result.status === 'rejected') {
              throw result.reason;
            }
            expect(result.value).toHaveProperty('reply');
          });
        }
      )
    );
  });

  it('should not exceed maximum context window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 50 }),
        async (messageHistory) => {
          const mockProposal = {
            id: 'test-proposal',
            webLinkToken: 'test-session',
            audit: {
              findings: [],
              tenantId: 'test-tenant',
            },
          };

          (prisma.proposal.findUnique as vi.Mock).mockResolvedValue(mockProposal);
          (ConversationMemory.getOrCreateSession as vi.Mock).mockResolvedValue({});

          // Mock a long history that should be truncated
          const longHistory = messageHistory.map((msg, i) => ({
            role: i % 2 === 0 ? 'user' : 'agent',
            text: msg,
            timestamp: new Date().toISOString(),
          }));

          (ConversationMemory.addMessage as vi.Mock).mockResolvedValue({
            history: longHistory,
            sentimentScore: 0.5,
            escalated: false,
          });

          const result = await runClosingAgent(
            'test-proposal',
            'test-session',
            'Test Business',
            'Test context',
            'Final message'
          );

          // Should complete without error
          expect(result).toHaveProperty('reply');
          expect(typeof result.reply).toBe('string');
        }
      )
    );
  });

  it('should handle various escalation scenarios', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.boolean(),
        fc.float({ min: 0, max: 1 }),
        async (message, shouldEscalate, sentimentScore) => {
          const mockProposal = {
            id: 'test-proposal',
            webLinkToken: 'test-session',
            audit: {
              findings: [],
              tenantId: 'test-tenant',
            },
          };

          (prisma.proposal.findUnique as vi.Mock).mockResolvedValue(mockProposal);
          (ConversationMemory.getOrCreateSession as vi.Mock).mockResolvedValue({});
          (ConversationMemory.addMessage as vi.Mock).mockResolvedValue({
            history: [],
            sentimentScore: sentimentScore,
            escalated: shouldEscalate,
          });

          const result = await runClosingAgent(
            'test-proposal',
            'test-session',
            'Test Business',
            'Test context',
            message
          );

          // Should always return proper structure
          expect(result).toHaveProperty('reply');
          expect(result).toHaveProperty('escalated');
          expect(result).toHaveProperty('sentiment');
          expect(typeof result.reply).toBe('string');
          expect(typeof result.escalated).toBe('boolean');
          expect(typeof result.sentiment).toBe('number');
        }
      )
    );
  });
});
