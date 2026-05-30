// @vitest-environment node
/**
 * Unit tests for ConversationMemory.updateSentiment
 *
 * Verifies:
 * 1. updateSentiment exists and is callable.
 * 2. Sentiment is clamped to [-1.0, 1.0].
 * 3. Repeated calls accumulate correctly.
 * 4. Returns undefined gracefully when state is not found.
 * 5. Positive and negative deltas both work.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma — ConversationMemory is a pure DB-backed class
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  proposalFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversationState: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      create: mocks.create,
    },
    proposal: {
      findUnique: mocks.proposalFindUnique,
    },
  },
}));

import { ConversationMemory } from '../memory';

describe('ConversationMemory.updateSentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exists and is a function', () => {
    expect(typeof ConversationMemory.updateSentiment).toBe('function');
  });

  it('returns undefined gracefully when conversation state is not found', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const result = await ConversationMemory.updateSentiment('nonexistent-proposal', 0.1);

    expect(result).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('applies a positive delta and clamps to 1.0', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.9 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: 1.0 });

    await ConversationMemory.updateSentiment('p1', 0.5);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proposalId: 'p1' },
        data: expect.objectContaining({ sentimentScore: 1.0 }),
      })
    );
  });

  it('applies a negative delta and clamps to -1.0', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: -0.8 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: -1.0 });

    await ConversationMemory.updateSentiment('p1', -0.5);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proposalId: 'p1' },
        data: expect.objectContaining({ sentimentScore: -1.0 }),
      })
    );
  });

  it('applies a small positive delta without clamping', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.0 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.05 });

    await ConversationMemory.updateSentiment('p1', 0.05);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentimentScore: 0.05 }),
      })
    );
  });

  it('applies a small negative delta without clamping', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.0 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: -0.2 });

    await ConversationMemory.updateSentiment('p1', -0.2);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentimentScore: -0.2 }),
      })
    );
  });

  it('increments engagementScore on every call', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.0 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.1 });

    await ConversationMemory.updateSentiment('p1', 0.1);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          engagementScore: { increment: 1 },
        }),
      })
    );
  });

  it('handles a delta of exactly 0 without error', async () => {
    mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.5 });
    mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: 0.5 });

    await ConversationMemory.updateSentiment('p1', 0);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentimentScore: 0.5 }),
      })
    );
  });

  it('result stays within [-1, 1] for any delta from any starting score', async () => {
    // Simulate a series of updates starting from 0
    const deltas = [0.3, 0.3, 0.3, 0.3, 0.3, -0.8, -0.8, -0.8];
    let currentScore = 0;

    for (const delta of deltas) {
      mocks.findUnique.mockResolvedValue({ proposalId: 'p1', sentimentScore: currentScore });

      const expectedScore = Math.max(-1.0, Math.min(1.0, currentScore + delta));
      mocks.update.mockResolvedValue({ proposalId: 'p1', sentimentScore: expectedScore });

      await ConversationMemory.updateSentiment('p1', delta);

      const updateCall = mocks.update.mock.calls[mocks.update.mock.calls.length - 1]?.[0];
      const savedScore = updateCall?.data?.sentimentScore;

      expect(savedScore).toBeGreaterThanOrEqual(-1.0);
      expect(savedScore).toBeLessThanOrEqual(1.0);

      currentScore = savedScore;
    }
  });
});
