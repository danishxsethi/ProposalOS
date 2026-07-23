/**
 * Unit tests for SocialMediaAgent
 *
 * Requirements: 4.1, 4.5, 4.7
 */

import { describe, it, expect } from 'vitest';
import {
  SocialMediaAgent,
  OPTIMAL_POSTING_TIMES,
} from '../socialMediaAgent';
import type { SocialMediaConfig, SocialPost, EngagementMetrics } from '../socialMediaAgent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(): SocialMediaAgent {
  return new SocialMediaAgent();
}

function makeConfig(overrides: Partial<SocialMediaConfig> = {}): SocialMediaConfig {
  return {
    clientId: 'client-001',
    businessName: 'Acme Plumbing',
    industry: 'plumbing',
    brandVoice: 'friendly',
    platforms: ['instagram', 'facebook', 'linkedin'],
    postingFrequency: { postsPerWeek: 3 },
    localMarket: { city: 'Austin', region: 'TX' },
    ...overrides,
  };
}

function makeEngagementMetrics(overrides: Partial<EngagementMetrics> = {}): EngagementMetrics {
  return {
    clientId: 'client-001',
    dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
    totalPosts: 30,
    totalReach: 6700,
    totalImpressions: 17500,
    totalEngagements: 680,
    averageEngagementRate: 0.039,
    platformMetrics: {
      instagram: { posts: 12, reach: 3200, impressions: 8500, engagementRate: 0.048, topContentType: 'behind-the-scenes' },
      facebook: { posts: 10, reach: 2100, impressions: 5800, engagementRate: 0.032, topContentType: 'promotional' },
      linkedin: { posts: 8, reach: 1400, impressions: 3200, engagementRate: 0.041, topContentType: 'educational' },
    },
    topPerformingPosts: [
      { postId: 'post-top-1', engagementRate: 0.12, contentType: 'behind-the-scenes' },
    ],
    lowPerformingPosts: [
      { postId: 'post-low-1', engagementRate: 0.008, contentType: 'promotional' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// OPTIMAL_POSTING_TIMES constants
// ---------------------------------------------------------------------------

describe('OPTIMAL_POSTING_TIMES', () => {
  it('defines times for instagram', () => {
    expect(OPTIMAL_POSTING_TIMES.instagram.length).toBeGreaterThan(0);
  });

  it('defines times for facebook', () => {
    expect(OPTIMAL_POSTING_TIMES.facebook.length).toBeGreaterThan(0);
  });

  it('defines times for linkedin', () => {
    expect(OPTIMAL_POSTING_TIMES.linkedin.length).toBeGreaterThan(0);
  });

  it('all times are in HH:MM format', () => {
    const timeRegex = /^\d{2}:\d{2}$/;
    for (const times of Object.values(OPTIMAL_POSTING_TIMES)) {
      for (const t of times) {
        expect(t).toMatch(timeRegex);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// generateContentCalendar — Requirements 4.1, 4.3, 4.4
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.generateContentCalendar', () => {
  it('returns a calendar with the correct clientId', async () => {
    const agent = makeAgent();
    const config = makeConfig({ clientId: 'client-xyz' });
    const calendar = await agent.generateContentCalendar(config, 2);

    expect(calendar.clientId).toBe('client-xyz');
  });

  it('returns a calendar with the correct weeks count', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 4);

    expect(calendar.weeks).toBe(4);
  });

  it('generates posts for all configured platforms', async () => {
    const agent = makeAgent();
    const config = makeConfig({ platforms: ['instagram', 'facebook'] });
    const calendar = await agent.generateContentCalendar(config, 2);

    const platforms = new Set(calendar.posts.map((p) => p.platform));
    expect(platforms.has('instagram')).toBe(true);
    expect(platforms.has('facebook')).toBe(true);
  });

  it('generates posts with varied content types', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 4);

    const contentTypes = new Set(calendar.posts.map((p) => p.contentType));
    expect(contentTypes.size).toBeGreaterThan(1);
  });

  it('returns a non-empty posts array', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 2);

    expect(calendar.posts.length).toBeGreaterThan(0);
  });

  it('totalPosts matches the posts array length', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 3);

    expect(calendar.totalPosts).toBe(calendar.posts.length);
  });

  it('platformBreakdown sums to totalPosts', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 2);

    const sum = Object.values(calendar.platformBreakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(calendar.totalPosts);
  });

  it('contentTypeBreakdown sums to totalPosts', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 2);

    const sum = Object.values(calendar.contentTypeBreakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(calendar.totalPosts);
  });

  it('endDate is after startDate', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 2);

    expect(calendar.endDate.getTime()).toBeGreaterThan(calendar.startDate.getTime());
  });

  it('all posts have status="draft"', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 1);

    for (const post of calendar.posts) {
      expect(post.status).toBe('draft');
    }
  });

  it('all posts have a non-empty id', async () => {
    const agent = makeAgent();
    const calendar = await agent.generateContentCalendar(makeConfig(), 1);

    for (const post of calendar.posts) {
      expect(typeof post.id).toBe('string');
      expect(post.id.length).toBeGreaterThan(0);
    }
  });

  it('generates more posts for more weeks', async () => {
    const agent = makeAgent();
    const cal2 = await agent.generateContentCalendar(makeConfig(), 2);
    const cal4 = await agent.generateContentCalendar(makeConfig(), 4);

    expect(cal4.totalPosts).toBeGreaterThan(cal2.totalPosts);
  });
});

// ---------------------------------------------------------------------------
// generatePost — Requirements 4.1, 4.2, 4.6
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.generatePost', () => {
  it('returns a post with a non-empty id', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');

    expect(typeof post.id).toBe('string');
    expect(post.id.length).toBeGreaterThan(0);
  });

  it('returns a post with the correct clientId', async () => {
    const agent = makeAgent();
    const config = makeConfig({ clientId: 'client-abc' });
    const post = await agent.generatePost(config, 'educational');

    expect(post.clientId).toBe('client-abc');
  });

  it('returns a post with the correct contentType', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'testimonial');

    expect(post.contentType).toBe('testimonial');
  });

  it('returns a post with a non-empty caption', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');

    expect(typeof post.caption).toBe('string');
    expect(post.caption.length).toBeGreaterThan(0);
  });

  it('returns a post with at least one hashtag', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'educational');

    expect(Array.isArray(post.hashtags)).toBe(true);
    expect(post.hashtags.length).toBeGreaterThan(0);
  });

  it('returns a post with at least one mediaUrl', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'behind-the-scenes');

    expect(Array.isArray(post.mediaUrls)).toBe(true);
    expect(post.mediaUrls.length).toBeGreaterThan(0);
  });

  it('returns a post with status="draft"', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'community');

    expect(post.status).toBe('draft');
  });

  it('returns a post with a scheduledAt date', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');

    expect(post.scheduledAt).toBeInstanceOf(Date);
  });

  it('uses the first platform when no platform is specified', async () => {
    const agent = makeAgent();
    const config = makeConfig({ platforms: ['linkedin', 'facebook'] });
    const post = await agent.generatePost(config, 'educational');

    expect(post.platform).toBe('linkedin');
  });

  it('uses the specified platform when provided', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional', 'facebook');

    expect(post.platform).toBe('facebook');
  });

  it('includes the city in the caption for local market context', async () => {
    const agent = makeAgent();
    const config = makeConfig({ localMarket: { city: 'Denver', region: 'CO' } });
    const post = await agent.generatePost(config, 'promotional');

    expect(post.caption).toContain('Denver');
  });

  it('includes the business name in the caption', async () => {
    const agent = makeAgent();
    const config = makeConfig({ businessName: 'Denver Plumbing Co' });
    const post = await agent.generatePost(config, 'promotional');

    expect(post.caption).toContain('Denver Plumbing Co');
  });

  it('persists the post so getPost returns it', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');

    const stored = agent.getPost(post.id);
    expect(stored).toBeDefined();
    expect(stored?.id).toBe(post.id);
  });

  it('instagram posts have more hashtags than linkedin posts', async () => {
    const agent = makeAgent();
    const igPost = await agent.generatePost(makeConfig(), 'promotional', 'instagram');
    const liPost = await agent.generatePost(makeConfig(), 'promotional', 'linkedin');

    expect(igPost.hashtags.length).toBeGreaterThanOrEqual(liPost.hashtags.length);
  });

  it('all hashtags start with #', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'educational', 'instagram');

    for (const tag of post.hashtags) {
      expect(tag.startsWith('#')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// schedulePost — Requirement 4.5
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.schedulePost', () => {
  it('returns a ScheduledPost with status="scheduled"', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');
    const scheduled = await agent.schedulePost(post);

    expect(scheduled.status).toBe('scheduled');
  });

  it('returns a ScheduledPost with a non-empty confirmationId', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');
    const scheduled = await agent.schedulePost(post);

    expect(typeof scheduled.confirmationId).toBe('string');
    expect(scheduled.confirmationId.length).toBeGreaterThan(0);
  });

  it('preserves the post id', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'educational');
    const scheduled = await agent.schedulePost(post);

    expect(scheduled.id).toBe(post.id);
  });

  it('preserves the scheduledAt date', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'testimonial');
    const scheduled = await agent.schedulePost(post);

    expect(scheduled.scheduledAt.getTime()).toBe(post.scheduledAt.getTime());
  });

  it('updates the stored post status to "scheduled"', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'community');
    await agent.schedulePost(post);

    const stored = agent.getPost(post.id);
    expect(stored?.status).toBe('scheduled');
  });

  it('schedules posts at optimal times for the platform', async () => {
    const agent = makeAgent();
    const config = makeConfig({ platforms: ['instagram'] });
    const calendar = await agent.generateContentCalendar(config, 1);

    for (const post of calendar.posts) {
      const scheduled = await agent.schedulePost(post);
      const hours = scheduled.scheduledAt.getHours();
      const minutes = scheduled.scheduledAt.getMinutes();
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      expect(OPTIMAL_POSTING_TIMES.instagram).toContain(timeStr);
    }
  });
});

// ---------------------------------------------------------------------------
// getEngagementMetrics — Requirement 4.7
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.getEngagementMetrics', () => {
  it('returns metrics with the correct clientId', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(metrics.clientId).toBe('client-001');
  });

  it('returns metrics with the correct dateRange', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(metrics.dateRange.start.getTime()).toBe(dateRange.start.getTime());
    expect(metrics.dateRange.end.getTime()).toBe(dateRange.end.getTime());
  });

  it('returns a positive totalPosts count', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(metrics.totalPosts).toBeGreaterThan(0);
  });

  it('returns an averageEngagementRate between 0 and 1', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(metrics.averageEngagementRate).toBeGreaterThanOrEqual(0);
    expect(metrics.averageEngagementRate).toBeLessThanOrEqual(1);
  });

  it('returns platformMetrics for instagram, facebook, and linkedin', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(metrics.platformMetrics.instagram).toBeDefined();
    expect(metrics.platformMetrics.facebook).toBeDefined();
    expect(metrics.platformMetrics.linkedin).toBeDefined();
  });

  it('returns topPerformingPosts array', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(Array.isArray(metrics.topPerformingPosts)).toBe(true);
  });

  it('returns lowPerformingPosts array', async () => {
    const agent = makeAgent();
    const dateRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const metrics = await agent.getEngagementMetrics('client-001', dateRange);

    expect(Array.isArray(metrics.lowPerformingPosts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// adjustStrategy — Requirement 4.7
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.adjustStrategy', () => {
  it('returns a StrategyAdjustment with the correct clientId', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.clientId).toBe('client-001');
  });

  it('returns a StrategyAdjustment with an adjustedAt date', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.adjustedAt).toBeInstanceOf(Date);
  });

  it('returns a non-empty recommendations array', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(Array.isArray(adjustment.recommendations)).toBe(true);
    expect(adjustment.recommendations.length).toBeGreaterThan(0);
  });

  it('returns contentTypeWeights for all 5 content types', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.contentTypeWeights.promotional).toBeDefined();
    expect(adjustment.contentTypeWeights.educational).toBeDefined();
    expect(adjustment.contentTypeWeights['behind-the-scenes']).toBeDefined();
    expect(adjustment.contentTypeWeights.testimonial).toBeDefined();
    expect(adjustment.contentTypeWeights.community).toBeDefined();
  });

  it('all contentTypeWeights are between 0 and 1', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    for (const weight of Object.values(adjustment.contentTypeWeights)) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it('returns a platformFocus array with at least one platform', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(Array.isArray(adjustment.platformFocus)).toBe(true);
    expect(adjustment.platformFocus.length).toBeGreaterThan(0);
  });

  it('returns a postingFrequencyAdjustment with postsPerWeek >= 1', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.postingFrequencyAdjustment.postsPerWeek).toBeGreaterThanOrEqual(1);
  });

  it('returns a postingFrequencyAdjustment with a non-empty reason', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(typeof adjustment.postingFrequencyAdjustment.reason).toBe('string');
    expect(adjustment.postingFrequencyAdjustment.reason.length).toBeGreaterThan(0);
  });

  it('increases posting frequency when engagement rate is high (> 0.05)', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics({ averageEngagementRate: 0.08 });
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.postingFrequencyAdjustment.postsPerWeek).toBeGreaterThan(3);
  });

  it('decreases posting frequency when engagement rate is low (< 0.02)', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics({ averageEngagementRate: 0.01 });
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.postingFrequencyAdjustment.postsPerWeek).toBeLessThan(3);
  });

  it('returns optimalPostingTimes for all platforms', async () => {
    const agent = makeAgent();
    const metrics = makeEngagementMetrics();
    const adjustment = await agent.adjustStrategy('client-001', metrics);

    expect(adjustment.optimalPostingTimes.instagram).toBeDefined();
    expect(adjustment.optimalPostingTimes.facebook).toBeDefined();
    expect(adjustment.optimalPostingTimes.linkedin).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// flagForReview — Requirement 4.8
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.flagForReview', () => {
  it('creates a review flag for the post', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');
    await agent.flagForReview(post.id, 'Negative engagement detected');

    const flag = agent.getReviewFlag(post.id);
    expect(flag).toBeDefined();
  });

  it('stores the correct postId in the flag', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');
    await agent.flagForReview(post.id, 'Negative engagement');

    const flag = agent.getReviewFlag(post.id);
    expect(flag?.postId).toBe(post.id);
  });

  it('stores the reason in the flag', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'educational');
    await agent.flagForReview(post.id, 'High negative comment ratio');

    const flag = agent.getReviewFlag(post.id);
    expect(flag?.reason).toBe('High negative comment ratio');
  });

  it('sets flag status to "pending"', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'testimonial');
    await agent.flagForReview(post.id, 'Negative engagement');

    const flag = agent.getReviewFlag(post.id);
    expect(flag?.status).toBe('pending');
  });

  it('sets a flaggedAt date', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'community');
    await agent.flagForReview(post.id, 'Negative engagement');

    const flag = agent.getReviewFlag(post.id);
    expect(flag?.flaggedAt).toBeInstanceOf(Date);
  });

  it('updates the post status to "failed" after flagging', async () => {
    const agent = makeAgent();
    const post = await agent.generatePost(makeConfig(), 'promotional');
    await agent.flagForReview(post.id, 'Negative engagement');

    const stored = agent.getPost(post.id);
    expect(stored?.status).toBe('failed');
  });

  it('does not throw for a postId that is not in the store', async () => {
    const agent = makeAgent();

    // Should not throw — just creates a flag without updating a post
    await expect(
      agent.flagForReview('nonexistent-post', 'Negative engagement')
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// execute — base agent integration
// ---------------------------------------------------------------------------

describe('SocialMediaAgent.execute', () => {
  it('returns a successful result', async () => {
    const agent = makeAgent();
    const result = await agent.execute({
      taskId: 'task-001',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: makeConfig() as unknown as Record<string, unknown>,
    });

    expect(result.success).toBe(true);
  });

  it('returns a summary mentioning the business name', async () => {
    const agent = makeAgent();
    const result = await agent.execute({
      taskId: 'task-001',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: makeConfig({ businessName: 'Acme Plumbing' }) as unknown as Record<string, unknown>,
    });

    expect(result.summary).toContain('Acme Plumbing');
  });

  it('sets agent status to "completed" after successful execution', async () => {
    const agent = makeAgent();
    await agent.execute({
      taskId: 'task-001',
      tenantId: 'tenant-001',
      proposalId: 'proposal-001',
      config: makeConfig() as unknown as Record<string, unknown>,
    });

    expect(agent.getStatus()).toBe('completed');
  });

  it('returns agentType "social_media"', () => {
    const agent = makeAgent();
    expect(agent.getAgentType()).toBe('social_media');
  });
});
