/**
 * Unit tests for GBPOptimizationAgent
 *
 * Requirements: 2.1, 2.5, 2.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GBPOptimizationAgent } from '../gbpOptimizationAgent';
import type { GBPOptimizationConfig, PostContent } from '../gbpOptimizationAgent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(): GBPOptimizationAgent {
  return new GBPOptimizationAgent();
}

const baseConfig: GBPOptimizationConfig = {
  clientId: 'client-001',
  placeId: 'place-abc123',
  businessName: 'Acme Plumbing',
  industry: 'plumbing',
  targetKeywords: ['plumber', 'drain repair', 'emergency plumbing'],
};

const samplePostContent: PostContent = {
  title: 'Summer Special',
  body: 'Get 10% off all drain services this summer.',
  callToAction: 'Book Now',
};

// ---------------------------------------------------------------------------
// verifyClaimStatus — Requirement 2.1
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.verifyClaimStatus', () => {
  it('returns an object with a boolean claimed field', async () => {
    const agent = makeAgent();
    const result = await agent.verifyClaimStatus(baseConfig.placeId);

    expect(typeof result.claimed).toBe('boolean');
  });

  it('returns an object with a boolean claimable field', async () => {
    const agent = makeAgent();
    const result = await agent.verifyClaimStatus(baseConfig.placeId);

    expect(typeof result.claimable).toBe('boolean');
  });

  it('returns both claimed and claimable fields together', async () => {
    const agent = makeAgent();
    const result = await agent.verifyClaimStatus('place-xyz');

    expect(result).toHaveProperty('claimed');
    expect(result).toHaveProperty('claimable');
  });
});

// ---------------------------------------------------------------------------
// optimizeProfile — Requirement 2.2
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.optimizeProfile', () => {
  it('returns success=true', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.success).toBe(true);
  });

  it('returns updatedFields containing businessHours', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.updatedFields).toContain('businessHours');
  });

  it('returns updatedFields containing categories', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.updatedFields).toContain('categories');
  });

  it('returns updatedFields containing attributes', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.updatedFields).toContain('attributes');
  });

  it('returns updatedFields containing description', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.updatedFields).toContain('description');
  });

  it('returns a non-empty message', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('returns an optimizedAt date', async () => {
    const agent = makeAgent();
    const result = await agent.optimizeProfile(baseConfig);

    expect(result.optimizedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// respondToReview — Requirements 2.5, 2.6
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.respondToReview — positive sentiment', () => {
  it('returns autoPosted=true for positive sentiment', async () => {
    const agent = makeAgent();
    const result = await agent.respondToReview(
      'review-001',
      'positive',
      'Thank you for your kind words!'
    );

    expect(result.autoPosted).toBe(true);
  });

  it('returns flaggedForReview=false for positive sentiment', async () => {
    const agent = makeAgent();
    const result = await agent.respondToReview(
      'review-002',
      'positive',
      'We appreciate your feedback!'
    );

    expect(result.flaggedForReview).toBe(false);
  });

  it('stores the review response and can be retrieved', async () => {
    const agent = makeAgent();
    const reviewId = 'review-pos-003';
    await agent.respondToReview(reviewId, 'positive', 'Thanks!');

    const stored = agent.getReviewResponse(reviewId);
    expect(stored).toBeDefined();
    expect(stored?.reviewId).toBe(reviewId);
  });

  it('preserves the draft response text', async () => {
    const agent = makeAgent();
    const draft = 'Thank you so much for the 5-star review!';
    const result = await agent.respondToReview('review-004', 'positive', draft);

    expect(result.response).toBe(draft);
  });

  it('returns a respondedAt date', async () => {
    const agent = makeAgent();
    const result = await agent.respondToReview('review-005', 'positive', 'Thanks!');

    expect(result.respondedAt).toBeInstanceOf(Date);
  });
});

describe('GBPOptimizationAgent.respondToReview — negative sentiment', () => {
  it('returns autoPosted=false for negative sentiment', async () => {
    const agent = makeAgent();
    const result = await agent.respondToReview(
      'review-neg-001',
      'negative',
      'We are sorry to hear about your experience.'
    );

    expect(result.autoPosted).toBe(false);
  });

  it('returns flaggedForReview=true for negative sentiment', async () => {
    const agent = makeAgent();
    const result = await agent.respondToReview(
      'review-neg-002',
      'negative',
      'We apologise and would like to make this right.'
    );

    expect(result.flaggedForReview).toBe(true);
  });

  it('stores the negative review response and can be retrieved', async () => {
    const agent = makeAgent();
    const reviewId = 'review-neg-003';
    await agent.respondToReview(reviewId, 'negative', 'We are sorry.');

    const stored = agent.getReviewResponse(reviewId);
    expect(stored).toBeDefined();
    expect(stored?.flaggedForReview).toBe(true);
  });

  it('preserves the draft response text for negative reviews', async () => {
    const agent = makeAgent();
    const draft = 'We sincerely apologise for the inconvenience.';
    const result = await agent.respondToReview('review-neg-004', 'negative', draft);

    expect(result.response).toBe(draft);
  });
});

// ---------------------------------------------------------------------------
// generateAndUploadPhotos — Requirement 2.3
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.generateAndUploadPhotos', () => {
  it('uses ai-generated source when no assets are provided', async () => {
    const agent = makeAgent();
    const result = await agent.generateAndUploadPhotos(baseConfig);

    expect(result.source).toBe('ai-generated');
  });

  it('uses client-assets source when assets are provided', async () => {
    const agent = makeAgent();
    const assets = ['https://client.com/photo1.jpg', 'https://client.com/photo2.jpg'];
    const result = await agent.generateAndUploadPhotos(baseConfig, assets);

    expect(result.source).toBe('client-assets');
  });

  it('returns success=true', async () => {
    const agent = makeAgent();
    const result = await agent.generateAndUploadPhotos(baseConfig);

    expect(result.success).toBe(true);
  });

  it('returns the provided assets as photoUrls when assets are given', async () => {
    const agent = makeAgent();
    const assets = ['https://client.com/img1.jpg'];
    const result = await agent.generateAndUploadPhotos(baseConfig, assets);

    expect(result.photoUrls).toEqual(assets);
  });

  it('returns non-empty photoUrls when no assets are provided', async () => {
    const agent = makeAgent();
    const result = await agent.generateAndUploadPhotos(baseConfig);

    expect(result.photoUrls.length).toBeGreaterThan(0);
  });

  it('returns uploadedCount matching photoUrls length', async () => {
    const agent = makeAgent();
    const result = await agent.generateAndUploadPhotos(baseConfig);

    expect(result.uploadedCount).toBe(result.photoUrls.length);
  });
});

// ---------------------------------------------------------------------------
// schedulePost — Requirement 2.4
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.schedulePost', () => {
  it('returns a ScheduledPost with status="scheduled"', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    expect(result.status).toBe('scheduled');
  });

  it('returns a ScheduledPost with a non-empty id', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('returns a ScheduledPost with the correct placeId', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    expect(result.placeId).toBe(baseConfig.placeId);
  });

  it('returns a ScheduledPost with a future scheduledAt date', async () => {
    const agent = makeAgent();
    const before = Date.now();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    expect(result.scheduledAt.getTime()).toBeGreaterThan(before);
  });

  it('stores the post so it can be retrieved', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    const stored = agent.getScheduledPost(result.id);
    expect(stored).toBeDefined();
    expect(stored?.id).toBe(result.id);
  });

  it('uses the default cadence of 7 days when not specified', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent);

    expect(result.cadenceDays).toBe(7);
  });

  it('uses a custom cadence when specified', async () => {
    const agent = makeAgent();
    const result = await agent.schedulePost(baseConfig, samplePostContent, 14);

    expect(result.cadenceDays).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// answerQuestion — Requirement 2.7
// ---------------------------------------------------------------------------

describe('GBPOptimizationAgent.answerQuestion', () => {
  it('returns a QAResponse with success=true', async () => {
    const agent = makeAgent();
    const result = await agent.answerQuestion('q-001', 'We are open 7 days a week.');

    expect(result.success).toBe(true);
  });

  it('returns a QAResponse with the correct questionId', async () => {
    const agent = makeAgent();
    const result = await agent.answerQuestion('q-002', 'Yes, we offer free estimates.');

    expect(result.questionId).toBe('q-002');
  });

  it('returns a QAResponse with the provided answer', async () => {
    const agent = makeAgent();
    const answer = 'We accept all major credit cards.';
    const result = await agent.answerQuestion('q-003', answer);

    expect(result.answer).toBe(answer);
  });

  it('returns a QAResponse with a postedAt date', async () => {
    const agent = makeAgent();
    const result = await agent.answerQuestion('q-004', 'Yes, we are licensed and insured.');

    expect(result.postedAt).toBeInstanceOf(Date);
  });

  it('stores the Q&A response so it can be retrieved', async () => {
    const agent = makeAgent();
    const questionId = 'q-005';
    await agent.answerQuestion(questionId, 'We serve the entire metro area.');

    const stored = agent.getQAResponse(questionId);
    expect(stored).toBeDefined();
    expect(stored?.questionId).toBe(questionId);
  });
});
