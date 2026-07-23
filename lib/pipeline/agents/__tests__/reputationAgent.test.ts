/**
 * Unit tests for ReputationAgent
 *
 * Requirements: 5.3, 5.4, 5.8
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReputationAgent } from '../reputationAgent';
import type {
  ReputationConfig,
  Review,
  ReviewPlatform,
} from '../reputationAgent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(): ReputationAgent {
  return new ReputationAgent();
}

const baseConfig: ReputationConfig = {
  clientId: 'client-rep-001',
  businessName: 'Acme Plumbing',
  platforms: ['google', 'yelp', 'bbb'],
  alertThreshold: 0.4,
  autoRespondPositive: true,
  escalationEmail: 'manager@acmeplumbing.com',
};

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    platform: 'google',
    rating: 5,
    text: 'Great service!',
    authorName: 'Test User',
    postedAt: new Date(),
    sentiment: 'positive',
    sentimentScore: 1.0,
    responded: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// configureMonitoring — Requirement 5.1
// ---------------------------------------------------------------------------

describe('ReputationAgent.configureMonitoring', () => {
  it('stores the monitoring config for the client', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const stored = agent.getMonitoringConfig(baseConfig.clientId);
    expect(stored).toBeDefined();
    expect(stored?.clientId).toBe(baseConfig.clientId);
  });

  it('stores all configured platforms', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const stored = agent.getMonitoringConfig(baseConfig.clientId);
    expect(stored?.platforms).toEqual(baseConfig.platforms);
  });

  it('seeds stub reviews after configuration', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    expect(reviews.length).toBeGreaterThan(0);
  });

  it('does not overwrite existing reviews on re-configuration', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);
    const firstCount = (await agent.getReviews(baseConfig.clientId)).length;

    // Re-configure — should not duplicate reviews
    await agent.configureMonitoring(baseConfig);
    const secondCount = (await agent.getReviews(baseConfig.clientId)).length;

    expect(secondCount).toBe(firstCount);
  });
});

// ---------------------------------------------------------------------------
// getReviews — Requirement 5.2
// ---------------------------------------------------------------------------

describe('ReputationAgent.getReviews', () => {
  it('returns an empty array for an unknown client', async () => {
    const agent = makeAgent();
    const reviews = await agent.getReviews('unknown-client');
    expect(reviews).toEqual([]);
  });

  it('returns all reviews when no filters are applied', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    expect(reviews.length).toBeGreaterThan(0);
  });

  it('filters by platform', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId, { platform: 'google' });
    expect(reviews.every((r) => r.platform === 'google')).toBe(true);
  });

  it('filters by sentiment', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId, { sentiment: 'positive' });
    expect(reviews.every((r) => r.sentiment === 'positive')).toBe(true);
  });

  it('filters by minRating', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId, { minRating: 4 });
    expect(reviews.every((r) => r.rating >= 4)).toBe(true);
  });

  it('filters by maxRating', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId, { maxRating: 3 });
    expect(reviews.every((r) => r.rating <= 3)).toBe(true);
  });

  it('filters by responded status', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const unresponded = await agent.getReviews(baseConfig.clientId, { responded: false });
    expect(unresponded.every((r) => r.responded === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// analyzeSentiment — Requirements 5.2, 5.5
// ---------------------------------------------------------------------------

describe('ReputationAgent.analyzeSentiment', () => {
  it('returns totalReviews matching the input array length', async () => {
    const agent = makeAgent();
    const reviews = [
      makeReview({ rating: 5, sentiment: 'positive', sentimentScore: 1.0 }),
      makeReview({ rating: 2, sentiment: 'negative', sentimentScore: 0.25 }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    expect(result.totalReviews).toBe(2);
  });

  it('returns zero values for an empty review array', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSentiment([]);

    expect(result.totalReviews).toBe(0);
    expect(result.averageRating).toBe(0);
    expect(result.averageSentimentScore).toBe(0);
  });

  it('computes correct averageRating', async () => {
    const agent = makeAgent();
    const reviews = [
      makeReview({ rating: 4, sentimentScore: 0.75 }),
      makeReview({ rating: 2, sentimentScore: 0.25 }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    expect(result.averageRating).toBeCloseTo(3.0);
  });

  it('computes correct averageSentimentScore', async () => {
    const agent = makeAgent();
    const reviews = [
      makeReview({ sentimentScore: 0.8 }),
      makeReview({ sentimentScore: 0.4 }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    expect(result.averageSentimentScore).toBeCloseTo(0.6);
  });

  it('counts sentiment breakdown correctly', async () => {
    const agent = makeAgent();
    const reviews = [
      makeReview({ sentiment: 'positive' }),
      makeReview({ sentiment: 'positive' }),
      makeReview({ sentiment: 'neutral' }),
      makeReview({ sentiment: 'negative' }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    expect(result.sentimentBreakdown.positive).toBe(2);
    expect(result.sentimentBreakdown.neutral).toBe(1);
    expect(result.sentimentBreakdown.negative).toBe(1);
  });

  it('triggers alert when average sentiment score is below threshold', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring({ ...baseConfig, alertThreshold: 0.8 });

    const reviews = await agent.getReviews(baseConfig.clientId, { maxRating: 2 });
    // Use only low-rated reviews to force low sentiment score
    const lowReviews = [
      makeReview({ rating: 1, sentiment: 'negative', sentimentScore: 0.0 }),
      makeReview({ rating: 2, sentiment: 'negative', sentimentScore: 0.25 }),
    ];

    const result = await agent.analyzeSentiment(lowReviews);
    // averageSentimentScore = 0.125, threshold = 0.8 → alert should trigger
    expect(result.alertTriggered).toBe(true);
  });

  it('does not trigger alert when sentiment is above threshold', async () => {
    const agent = makeAgent();
    const reviews = [
      makeReview({ rating: 5, sentiment: 'positive', sentimentScore: 1.0 }),
      makeReview({ rating: 4, sentiment: 'positive', sentimentScore: 0.75 }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    // averageSentimentScore = 0.875, default threshold = 0.3 → no alert
    expect(result.alertTriggered).toBe(false);
  });

  it('builds monthly trends from review dates', async () => {
    const agent = makeAgent();
    const jan = new Date('2024-01-15');
    const feb = new Date('2024-02-10');
    const reviews = [
      makeReview({ postedAt: jan, sentimentScore: 0.8, sentiment: 'positive', rating: 4 }),
      makeReview({ postedAt: feb, sentimentScore: 0.5, sentiment: 'neutral', rating: 3 }),
    ];

    const result = await agent.analyzeSentiment(reviews);
    expect(result.trends.length).toBe(2);
    expect(result.trends[0].period).toBe('2024-01');
    expect(result.trends[1].period).toBe('2024-02');
  });
});

// ---------------------------------------------------------------------------
// generateResponse — Requirements 5.3, 5.4
// ---------------------------------------------------------------------------

describe('ReputationAgent.generateResponse', () => {
  it('returns a non-empty response string for a positive review', async () => {
    const agent = makeAgent();
    const review = makeReview({ rating: 5, sentiment: 'positive' });

    const result = await agent.generateResponse(review);
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('returns a confidence score between 0 and 1', async () => {
    const agent = makeAgent();
    const review = makeReview({ rating: 4 });

    const result = await agent.generateResponse(review);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns a higher confidence for positive reviews than negative', async () => {
    const agent = makeAgent();
    const positive = makeReview({ rating: 5, sentiment: 'positive' });
    const negative = makeReview({ rating: 1, sentiment: 'negative' });

    const posResult = await agent.generateResponse(positive);
    const negResult = await agent.generateResponse(negative);

    expect(posResult.confidence).toBeGreaterThan(negResult.confidence);
  });

  it('includes the author name in the response', async () => {
    const agent = makeAgent();
    const review = makeReview({ rating: 5, authorName: 'Alice Smith' });

    const result = await agent.generateResponse(review);
    expect(result.response).toContain('Alice Smith');
  });

  it('generates a response for a neutral (3-star) review', async () => {
    const agent = makeAgent();
    const review = makeReview({ rating: 3, sentiment: 'neutral' });

    const result = await agent.generateResponse(review);
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// postResponse — Requirements 5.3, 5.4 (human review gate)
// ---------------------------------------------------------------------------

describe('ReputationAgent.postResponse — positive reviews (rating > 3)', () => {
  it('auto-posts for a 4-star review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const positiveReview = reviews.find((r) => r.rating === 4);
    if (!positiveReview) return; // skip if no 4-star review in stub data

    const result = await agent.postResponse(positiveReview.id, 'Thank you!');
    expect(result.autoPosted).toBe(true);
    expect(result.flaggedForReview).toBe(false);
  });

  it('auto-posts for a 5-star review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const fiveStarReview = reviews.find((r) => r.rating === 5);
    if (!fiveStarReview) return;

    const result = await agent.postResponse(fiveStarReview.id, 'Thank you so much!');
    expect(result.autoPosted).toBe(true);
    expect(result.flaggedForReview).toBe(false);
  });

  it('stores the response result for a positive review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const positiveReview = reviews.find((r) => r.rating > 3);
    if (!positiveReview) return;

    await agent.postResponse(positiveReview.id, 'Thanks!');
    const stored = agent.getResponseResult(positiveReview.id);
    expect(stored).toBeDefined();
    expect(stored?.autoPosted).toBe(true);
  });

  it('sets postedAt for auto-posted responses', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const positiveReview = reviews.find((r) => r.rating > 3);
    if (!positiveReview) return;

    const result = await agent.postResponse(positiveReview.id, 'Thanks!');
    expect(result.postedAt).toBeInstanceOf(Date);
  });
});

describe('ReputationAgent.postResponse — negative reviews (rating ≤ 3)', () => {
  it('does NOT auto-post for a 1-star review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const negativeReview = reviews.find((r) => r.rating === 1);
    if (!negativeReview) return;

    const result = await agent.postResponse(negativeReview.id, 'We apologise.');
    expect(result.autoPosted).toBe(false);
  });

  it('flags for human review for a 2-star review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const twoStarReview = reviews.find((r) => r.rating === 2);
    if (!twoStarReview) return;

    const result = await agent.postResponse(twoStarReview.id, 'We are sorry.');
    expect(result.flaggedForReview).toBe(true);
  });

  it('flags for human review for a 3-star review', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const threeStarReview = reviews.find((r) => r.rating === 3);
    if (!threeStarReview) return;

    const result = await agent.postResponse(threeStarReview.id, 'Thank you for your feedback.');
    expect(result.flaggedForReview).toBe(true);
    expect(result.autoPosted).toBe(false);
  });

  it('creates a human review flag entry for negative reviews', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const negativeReview = reviews.find((r) => r.rating <= 3);
    if (!negativeReview) return;

    await agent.postResponse(negativeReview.id, 'We apologise for the experience.');
    const flag = agent.getHumanReviewFlag(negativeReview.id);
    expect(flag).toBeDefined();
    expect(flag?.status).toBe('pending');
  });

  it('sets flaggedAt for flagged responses', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const negativeReview = reviews.find((r) => r.rating <= 3);
    if (!negativeReview) return;

    const result = await agent.postResponse(negativeReview.id, 'We apologise.');
    expect(result.flaggedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// flagForHumanReview — Requirement 5.8
// ---------------------------------------------------------------------------

describe('ReputationAgent.flagForHumanReview', () => {
  it('creates a flag with status=pending', async () => {
    const agent = makeAgent();
    const reviewId = 'review-legal-001';

    await agent.flagForHumanReview(reviewId, 'Potential legal threat detected');

    const flag = agent.getHumanReviewFlag(reviewId);
    expect(flag).toBeDefined();
    expect(flag?.status).toBe('pending');
  });

  it('stores the reason for escalation', async () => {
    const agent = makeAgent();
    const reviewId = 'review-legal-002';
    const reason = 'Review contains potential defamation claim';

    await agent.flagForHumanReview(reviewId, reason);

    const flag = agent.getHumanReviewFlag(reviewId);
    expect(flag?.reason).toBe(reason);
  });

  it('stores the reviewId in the flag', async () => {
    const agent = makeAgent();
    const reviewId = 'review-legal-003';

    await agent.flagForHumanReview(reviewId, 'Legal issue');

    const flag = agent.getHumanReviewFlag(reviewId);
    expect(flag?.reviewId).toBe(reviewId);
  });

  it('records a flaggedAt timestamp', async () => {
    const agent = makeAgent();
    const reviewId = 'review-legal-004';

    await agent.flagForHumanReview(reviewId, 'Urgent escalation');

    const flag = agent.getHumanReviewFlag(reviewId);
    expect(flag?.flaggedAt).toBeInstanceOf(Date);
  });

  it('stores the escalation email when config is available', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const reviews = await agent.getReviews(baseConfig.clientId);
    const review = reviews[0];
    if (!review) return;

    await agent.flagForHumanReview(review.id, 'Legal threat');

    const flag = agent.getHumanReviewFlag(review.id);
    expect(flag?.escalationEmail).toBe(baseConfig.escalationEmail);
  });
});

// ---------------------------------------------------------------------------
// getReputationReport — Requirement 5.6
// ---------------------------------------------------------------------------

describe('ReputationAgent.getReputationReport', () => {
  it('returns a report with the correct clientId', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.clientId).toBe(baseConfig.clientId);
  });

  it('returns a generatedAt date', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('returns a non-negative totalReviews count', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.totalReviews).toBeGreaterThanOrEqual(0);
  });

  it('returns a responseRate between 0 and 1', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.responseRate).toBeGreaterThanOrEqual(0);
    expect(report.responseRate).toBeLessThanOrEqual(1);
  });

  it('returns non-empty recommendations', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('returns ratingDistribution with keys 1–5', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const dateRange = { start: new Date('2020-01-01'), end: new Date('2030-12-31') };
    const report = await agent.getReputationReport(baseConfig.clientId, dateRange);

    expect(report.ratingDistribution).toHaveProperty('1');
    expect(report.ratingDistribution).toHaveProperty('5');
  });
});

// ---------------------------------------------------------------------------
// identifyPatterns — Requirement 5.7
// ---------------------------------------------------------------------------

describe('ReputationAgent.identifyPatterns', () => {
  it('returns patterns with a clientId', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const result = await agent.identifyPatterns(baseConfig.clientId);
    expect(result.clientId).toBe(baseConfig.clientId);
  });

  it('returns an analyzedAt date', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const result = await agent.identifyPatterns(baseConfig.clientId);
    expect(result.analyzedAt).toBeInstanceOf(Date);
  });

  it('returns at least one pattern', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const result = await agent.identifyPatterns(baseConfig.clientId);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('returns non-empty actionableInsights', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const result = await agent.identifyPatterns(baseConfig.clientId);
    expect(result.actionableInsights.length).toBeGreaterThan(0);
  });

  it('returns recurringComplaints and recurringPraise arrays', async () => {
    const agent = makeAgent();
    await agent.configureMonitoring(baseConfig);

    const result = await agent.identifyPatterns(baseConfig.clientId);
    expect(Array.isArray(result.recurringComplaints)).toBe(true);
    expect(Array.isArray(result.recurringPraise)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// execute — integration smoke test
// ---------------------------------------------------------------------------

describe('ReputationAgent.execute', () => {
  it('returns success=true for a valid config', async () => {
    const agent = makeAgent();
    const result = await agent.execute({
      taskId: 'task-001',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: baseConfig as unknown as Record<string, unknown>,
    });

    expect(result.success).toBe(true);
  });

  it('returns a non-empty summary', async () => {
    const agent = makeAgent();
    const result = await agent.execute({
      taskId: 'task-002',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: baseConfig as unknown as Record<string, unknown>,
    });

    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('sets agent status to completed after successful execution', async () => {
    const agent = makeAgent();
    await agent.execute({
      taskId: 'task-003',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: baseConfig as unknown as Record<string, unknown>,
    });

    expect(agent.getStatus()).toBe('completed');
  });

  it('returns agentType=reputation', () => {
    const agent = makeAgent();
    expect(agent.getAgentType()).toBe('reputation');
  });
});
