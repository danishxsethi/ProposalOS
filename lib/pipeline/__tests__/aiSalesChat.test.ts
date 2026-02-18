/**
 * Unit tests for AI Sales Chat
 * 
 * Tests specific examples and edge cases for chat functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectIntent, shouldEscalate, recordOutcome } from '../aiSalesChat';
import { prisma } from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatConversation: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    proposal: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock Gemini LLM
vi.mock('@/lib/llm/gemini', () => ({
  getGeminiModel: vi.fn(() => ({
    generateContent: vi.fn().mockResolvedValue({
      response: {
        candidates: [{
          content: {
            parts: [{ text: '{"intent": "question", "confidence": 0.8}' }],
          },
        }],
      },
    }),
  })),
}));

describe('AI Sales Chat - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectIntent', () => {
    it('detects purchase intent from "get started" keyword', async () => {
      const result = await detectIntent('How do I get started?');
      expect(result.intent).toBe('purchase_intent');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects purchase intent from "next step" keyword', async () => {
      const result = await detectIntent('What is the next step?');
      expect(result.intent).toBe('purchase_intent');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('detects objection from "too expensive" keyword', async () => {
      const result = await detectIntent('This seems too expensive for us');
      expect(result.intent).toBe('objection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('detects objection from "not sure" keyword', async () => {
      const result = await detectIntent('I\'m not sure this will work');
      expect(result.intent).toBe('objection');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('detects question from "what" keyword', async () => {
      const result = await detectIntent('What does this include?');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('detects question from "how" keyword', async () => {
      const result = await detectIntent('How long will this take?');
      expect(result.intent).toBe('question');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('handles empty message gracefully', async () => {
      const result = await detectIntent('');
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('handles very long message', async () => {
      const longMessage = 'What '.repeat(100) + 'is this about?';
      const result = await detectIntent(longMessage);
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('is case-insensitive for keyword matching', async () => {
      const result1 = await detectIntent('GET STARTED');
      const result2 = await detectIntent('get started');
      expect(result1.intent).toBe(result2.intent);
    });
  });

  describe('shouldEscalate', () => {
    it('escalates when confidence is below threshold', () => {
      expect(shouldEscalate(0.5, { threshold: 0.7 })).toBe(true);
      expect(shouldEscalate(0.69, { threshold: 0.7 })).toBe(true);
    });

    it('does not escalate when confidence meets threshold', () => {
      expect(shouldEscalate(0.7, { threshold: 0.7 })).toBe(false);
      expect(shouldEscalate(0.71, { threshold: 0.7 })).toBe(false);
    });

    it('does not escalate when confidence exceeds threshold', () => {
      expect(shouldEscalate(0.9, { threshold: 0.7 })).toBe(false);
      expect(shouldEscalate(1.0, { threshold: 0.7 })).toBe(false);
    });

    it('handles edge case of 0 confidence', () => {
      expect(shouldEscalate(0, { threshold: 0.7 })).toBe(true);
      expect(shouldEscalate(0, { threshold: 0 })).toBe(false);
    });

    it('handles edge case of 1.0 confidence', () => {
      expect(shouldEscalate(1.0, { threshold: 1.0 })).toBe(false);
      expect(shouldEscalate(1.0, { threshold: 0.5 })).toBe(false);
    });

    it('works with different threshold values', () => {
      expect(shouldEscalate(0.5, { threshold: 0.5 })).toBe(false);
      expect(shouldEscalate(0.49, { threshold: 0.5 })).toBe(true);
      expect(shouldEscalate(0.8, { threshold: 0.9 })).toBe(true);
    });
  });

  describe('recordOutcome', () => {
    it('updates existing conversation with outcome', async () => {
      const mockConversation = {
        id: 'conv-123',
        proposalId: 'prop-123',
        tenantId: 'tenant-123',
        sessionId: 'session-123',
        startedAt: new Date(),
      };

      (prisma.chatConversation.findFirst as any).mockResolvedValue(mockConversation);
      (prisma.chatConversation.update as any).mockResolvedValue({});

      await recordOutcome('prop-123', 'converted', ['pricing']);

      expect(prisma.chatConversation.findFirst).toHaveBeenCalledWith({
        where: { proposalId: 'prop-123' },
        orderBy: { startedAt: 'desc' },
      });

      expect(prisma.chatConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: {
          outcome: 'converted',
          objections: ['pricing'],
          completedAt: expect.any(Date),
        },
      });
    });

    it('creates new conversation if none exists', async () => {
      (prisma.chatConversation.findFirst as any).mockResolvedValue(null);
      (prisma.proposal.findUnique as any).mockResolvedValue({
        id: 'prop-123',
        tenantId: 'tenant-123',
      });
      (prisma.chatConversation.create as any).mockResolvedValue({});

      await recordOutcome('prop-123', 'escalated', ['timing', 'skepticism']);

      expect(prisma.proposal.findUnique).toHaveBeenCalledWith({
        where: { id: 'prop-123' },
        select: { tenantId: true },
      });

      expect(prisma.chatConversation.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          proposalId: 'prop-123',
          sessionId: expect.stringContaining('session-'),
          outcome: 'escalated',
          objections: ['timing', 'skepticism'],
          startedAt: expect.any(Date),
          completedAt: expect.any(Date),
        },
      });
    });

    it('handles empty objections array', async () => {
      const mockConversation = {
        id: 'conv-123',
        proposalId: 'prop-123',
      };

      (prisma.chatConversation.findFirst as any).mockResolvedValue(mockConversation);
      (prisma.chatConversation.update as any).mockResolvedValue({});

      await recordOutcome('prop-123', 'abandoned', []);

      expect(prisma.chatConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: {
          outcome: 'abandoned',
          objections: [],
          completedAt: expect.any(Date),
        },
      });
    });

    it('handles multiple objections', async () => {
      const mockConversation = {
        id: 'conv-123',
        proposalId: 'prop-123',
      };

      (prisma.chatConversation.findFirst as any).mockResolvedValue(mockConversation);
      (prisma.chatConversation.update as any).mockResolvedValue({});

      await recordOutcome('prop-123', 'converted', ['pricing', 'timing', 'skepticism']);

      expect(prisma.chatConversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: {
          outcome: 'converted',
          objections: ['pricing', 'timing', 'skepticism'],
          completedAt: expect.any(Date),
        },
      });
    });

    it('handles database errors gracefully', async () => {
      (prisma.chatConversation.findFirst as any).mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(recordOutcome('prop-123', 'converted', [])).resolves.not.toThrow();
    });
  });
});
