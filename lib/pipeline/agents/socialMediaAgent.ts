/**
 * Social Media Agent
 *
 * AI-powered agent for generating and posting social media content.
 * Stub implementation — no real social media API calls are made.
 *
 * Key behaviours:
 *  - generateContentCalendar: multi-week content planning across Instagram, Facebook, LinkedIn
 *  - generatePost: platform-specific content matching brand voice and local market
 *  - schedulePost: optimal timing based on engagement data
 *  - postNow: immediate posting (stub)
 *  - getEngagementMetrics: engagement data for a date range
 *  - adjustStrategy: content strategy adjustment based on performance
 *  - flagForReview: flag posts with negative engagement for human review
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import { BaseDeliveryAgent } from './baseDeliveryAgent';
import type {
  DeliveryAgentContext,
  DeliveryAgentResult,
  DeliveryAgentType,
} from './baseDeliveryAgent';
import type { DateRange } from '../../pipeline/types';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin';
export type BrandVoice = 'professional' | 'friendly' | 'casual' | 'authoritative';
export type ContentType =
  | 'promotional'
  | 'educational'
  | 'behind-the-scenes'
  | 'testimonial'
  | 'community';
export type PostStatus = 'draft' | 'scheduled' | 'posted' | 'failed';

export interface SocialMediaConfig {
  clientId: string;
  businessName: string;
  industry: string;
  brandVoice: BrandVoice;
  platforms: SocialPlatform[];
  postingFrequency: { postsPerWeek: number };
  localMarket: { city: string; region: string };
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  engagementRate: number; // 0-1
}

export interface SocialPost {
  id: string;
  clientId: string;
  platform: SocialPlatform;
  contentType: ContentType;
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  scheduledAt: Date;
  status: PostStatus;
  engagement?: PostEngagement;
}

export interface ScheduledPost extends SocialPost {
  scheduledAt: Date;
  status: 'scheduled';
  confirmationId: string;
}

export interface PostResult {
  postId: string;
  platform: SocialPlatform;
  postedAt: Date;
  success: boolean;
  externalPostId?: string;
  error?: string;
}

export interface ContentCalendar {
  clientId: string;
  weeks: number;
  startDate: Date;
  endDate: Date;
  posts: SocialPost[];
  totalPosts: number;
  platformBreakdown: Record<SocialPlatform, number>;
  contentTypeBreakdown: Record<ContentType, number>;
}

export interface EngagementMetrics {
  clientId: string;
  dateRange: DateRange;
  totalPosts: number;
  totalReach: number;
  totalImpressions: number;
  totalEngagements: number;
  averageEngagementRate: number;
  platformMetrics: Record<
    SocialPlatform,
    {
      posts: number;
      reach: number;
      impressions: number;
      engagementRate: number;
      topContentType: ContentType;
    }
  >;
  topPerformingPosts: { postId: string; engagementRate: number; contentType: ContentType }[];
  lowPerformingPosts: { postId: string; engagementRate: number; contentType: ContentType }[];
}

export interface StrategyAdjustment {
  clientId: string;
  adjustedAt: Date;
  recommendations: string[];
  contentTypeWeights: Record<ContentType, number>;
  platformFocus: SocialPlatform[];
  postingFrequencyAdjustment: { postsPerWeek: number; reason: string };
  optimalPostingTimes: Record<SocialPlatform, string[]>;
}

export interface ReviewFlag {
  postId: string;
  reason: string;
  flaggedAt: Date;
  status: 'pending' | 'reviewed' | 'resolved';
}

// ---------------------------------------------------------------------------
// Optimal posting times by platform (Requirement 4.5)
// ---------------------------------------------------------------------------

export const OPTIMAL_POSTING_TIMES: Record<SocialPlatform, string[]> = {
  instagram: ['09:00', '12:00', '17:00', '19:00'],
  facebook: ['09:00', '13:00', '15:00', '18:00'],
  linkedin: ['08:00', '10:00', '12:00', '17:00'],
};

// ---------------------------------------------------------------------------
// In-memory stores (stub — replace with DB persistence)
// ---------------------------------------------------------------------------

const postStore = new Map<string, SocialPost>();
const reviewFlagStore = new Map<string, ReviewFlag>();

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------

export class SocialMediaAgent extends BaseDeliveryAgent {
  getAgentType(): DeliveryAgentType {
    return 'social_media';
  }

  /**
   * BaseDeliveryAgent.execute() entry point.
   * Generates a 4-week content calendar and schedules all posts.
   */
  async execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    this.status = 'in_progress';

    const config = context.config as unknown as SocialMediaConfig;

    try {
      const calendar = await this.generateContentCalendar(config, 4);

      // Schedule all draft posts
      let scheduledCount = 0;
      for (const post of calendar.posts) {
        await this.schedulePost(post);
        scheduledCount++;
      }

      this.status = 'completed';

      return {
        success: true,
        summary: `Social media content calendar created for ${config.businessName} — ${scheduledCount} posts scheduled`,
        data: {
          calendarId: `${config.clientId}-calendar`,
          totalPosts: calendar.totalPosts,
          platformBreakdown: calendar.platformBreakdown,
          weeks: calendar.weeks,
        },
        costCents: 100,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `Social media setup failed: ${message}`,
        costCents: 0,
        completedAt: new Date().toISOString(),
        error: message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Public agent methods
  // -------------------------------------------------------------------------

  /**
   * Generate a multi-week content calendar across all configured platforms.
   * Distributes posts evenly across platforms and content types.
   *
   * Requirements: 4.1, 4.3, 4.4
   */
  async generateContentCalendar(
    config: SocialMediaConfig,
    weeks: number
  ): Promise<ContentCalendar> {
    this.log(`Generating ${weeks}-week content calendar for ${config.businessName}`);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

    const posts: SocialPost[] = [];
    const contentTypes: ContentType[] = [
      'promotional',
      'educational',
      'behind-the-scenes',
      'testimonial',
      'community',
    ];

    const totalPostsPerWeek = config.postingFrequency.postsPerWeek * config.platforms.length;
    const totalPosts = totalPostsPerWeek * weeks;

    for (let i = 0; i < totalPosts; i++) {
      const platform = config.platforms[i % config.platforms.length];
      const contentType = contentTypes[i % contentTypes.length];

      // Distribute posts evenly across the calendar period
      const offsetMs = (i / totalPosts) * (endDate.getTime() - startDate.getTime());
      const postDate = new Date(startDate.getTime() + offsetMs);

      // Apply optimal posting time for the platform
      const optimalTimes = OPTIMAL_POSTING_TIMES[platform];
      const timeStr = optimalTimes[i % optimalTimes.length];
      const [hours, minutes] = timeStr.split(':').map(Number);
      postDate.setHours(hours, minutes, 0, 0);

      const post = await this.generatePost(config, contentType, platform, postDate);
      posts.push(post);
    }

    // Compute breakdowns
    const platformBreakdown = {} as Record<SocialPlatform, number>;
    const contentTypeBreakdown = {} as Record<ContentType, number>;

    for (const platform of config.platforms) {
      platformBreakdown[platform] = posts.filter((p) => p.platform === platform).length;
    }
    for (const ct of contentTypes) {
      contentTypeBreakdown[ct as ContentType] = posts.filter((p) => p.contentType === ct).length;
    }

    return {
      clientId: config.clientId,
      weeks,
      startDate,
      endDate,
      posts,
      totalPosts: posts.length,
      platformBreakdown,
      contentTypeBreakdown,
    };
  }

  /**
   * Generate a single platform-specific post matching brand voice and local market.
   * Stub: returns synthesised content. Replace with real AI content generation.
   *
   * Requirements: 4.1, 4.2, 4.4, 4.6
   */
  async generatePost(
    config: SocialMediaConfig,
    contentType: string,
    platform?: SocialPlatform,
    scheduledAt?: Date
  ): Promise<SocialPost> {
    const resolvedPlatform: SocialPlatform =
      platform ?? config.platforms[0] ?? 'instagram';
    const resolvedContentType = contentType as ContentType;

    this.log(
      `Generating ${resolvedContentType} post for ${config.businessName} on ${resolvedPlatform}`
    );

    const caption = this._buildCaption(
      config,
      resolvedContentType,
      resolvedPlatform
    );
    const hashtags = this._buildHashtags(config, resolvedContentType, resolvedPlatform);
    const mediaUrls = this._buildMediaUrls(config, resolvedContentType, resolvedPlatform);

    const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const postScheduledAt = scheduledAt ?? this._nextOptimalTime(resolvedPlatform);

    const post: SocialPost = {
      id,
      clientId: config.clientId,
      platform: resolvedPlatform,
      contentType: resolvedContentType,
      caption,
      hashtags,
      mediaUrls,
      scheduledAt: postScheduledAt,
      status: 'draft',
    };

    postStore.set(id, post);

    return post;
  }

  /**
   * Schedule a post at its optimal time.
   * Updates the post status from 'draft' to 'scheduled'.
   *
   * Requirement 4.5
   */
  async schedulePost(post: SocialPost): Promise<ScheduledPost> {
    this.log(`Scheduling post ${post.id} on ${post.platform} at ${post.scheduledAt.toISOString()}`);

    const confirmationId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const scheduled: ScheduledPost = {
      ...post,
      status: 'scheduled',
      scheduledAt: post.scheduledAt,
      confirmationId,
    };

    postStore.set(post.id, scheduled);

    return scheduled;
  }

  /**
   * Post content immediately (stub — no real API call).
   *
   * Requirement 4.5
   */
  async postNow(post: SocialPost): Promise<PostResult> {
    this.log(`Posting ${post.id} immediately on ${post.platform}`);

    const postedPost: SocialPost = { ...post, status: 'posted' };
    postStore.set(post.id, postedPost);

    return {
      postId: post.id,
      platform: post.platform,
      postedAt: new Date(),
      success: true,
      externalPostId: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  /**
   * Retrieve engagement metrics for a client over a date range.
   * Stub: returns synthesised metrics. Replace with real analytics API calls.
   *
   * Requirement 4.7
   */
  async getEngagementMetrics(
    clientId: string,
    dateRange: DateRange
  ): Promise<EngagementMetrics> {
    this.log(
      `Fetching engagement metrics for client ${clientId} ` +
        `(${dateRange.start.toISOString()} – ${dateRange.end.toISOString()})`
    );

    // Stub: synthesise realistic metrics
    const platformMetrics: EngagementMetrics['platformMetrics'] = {
      instagram: {
        posts: 12,
        reach: 3200,
        impressions: 8500,
        engagementRate: 0.048,
        topContentType: 'behind-the-scenes',
      },
      facebook: {
        posts: 10,
        reach: 2100,
        impressions: 5800,
        engagementRate: 0.032,
        topContentType: 'promotional',
      },
      linkedin: {
        posts: 8,
        reach: 1400,
        impressions: 3200,
        engagementRate: 0.041,
        topContentType: 'educational',
      },
    };

    return {
      clientId,
      dateRange,
      totalPosts: 30,
      totalReach: 6700,
      totalImpressions: 17500,
      totalEngagements: 680,
      averageEngagementRate: 0.039,
      platformMetrics,
      topPerformingPosts: [
        { postId: 'post-top-1', engagementRate: 0.12, contentType: 'behind-the-scenes' },
        { postId: 'post-top-2', engagementRate: 0.09, contentType: 'testimonial' },
        { postId: 'post-top-3', engagementRate: 0.08, contentType: 'educational' },
      ],
      lowPerformingPosts: [
        { postId: 'post-low-1', engagementRate: 0.008, contentType: 'promotional' },
        { postId: 'post-low-2', engagementRate: 0.011, contentType: 'community' },
      ],
    };
  }

  /**
   * Adjust content strategy based on engagement performance data.
   * Increases weight of high-performing content types and adjusts platform focus.
   *
   * Requirement 4.7
   */
  async adjustStrategy(
    clientId: string,
    performanceData: EngagementMetrics
  ): Promise<StrategyAdjustment> {
    this.log(`Adjusting strategy for client ${clientId} based on performance data`);

    // Determine best-performing platform by engagement rate
    const platformEntries = Object.entries(performanceData.platformMetrics) as [
      SocialPlatform,
      EngagementMetrics['platformMetrics'][SocialPlatform]
    ][];

    const sortedPlatforms = platformEntries
      .sort(([, a], [, b]) => b.engagementRate - a.engagementRate)
      .map(([platform]) => platform);

    // Build content type weights based on top-performing posts
    const contentTypeWeights: Record<ContentType, number> = {
      promotional: 0.15,
      educational: 0.25,
      'behind-the-scenes': 0.30,
      testimonial: 0.20,
      community: 0.10,
    };

    // Boost top-performing content types
    for (const { contentType } of performanceData.topPerformingPosts) {
      if (contentType in contentTypeWeights) {
        contentTypeWeights[contentType] = Math.min(
          contentTypeWeights[contentType] + 0.05,
          0.50
        );
      }
    }

    // Reduce low-performing content types
    for (const { contentType } of performanceData.lowPerformingPosts) {
      if (contentType in contentTypeWeights) {
        contentTypeWeights[contentType] = Math.max(
          contentTypeWeights[contentType] - 0.05,
          0.05
        );
      }
    }

    // Adjust posting frequency based on average engagement rate
    const currentFrequency = 3; // default posts per week
    const frequencyAdjustment =
      performanceData.averageEngagementRate > 0.05
        ? { postsPerWeek: currentFrequency + 1, reason: 'High engagement — increase frequency' }
        : performanceData.averageEngagementRate < 0.02
        ? { postsPerWeek: Math.max(currentFrequency - 1, 1), reason: 'Low engagement — reduce frequency and improve quality' }
        : { postsPerWeek: currentFrequency, reason: 'Engagement within target range — maintain frequency' };

    const recommendations: string[] = [
      `Focus on ${sortedPlatforms[0]} — highest engagement rate`,
      `Increase ${performanceData.topPerformingPosts[0]?.contentType ?? 'behind-the-scenes'} content`,
      `Reduce ${performanceData.lowPerformingPosts[0]?.contentType ?? 'promotional'} content`,
      'Post at optimal times for each platform',
      'Use more local market references in captions',
    ];

    return {
      clientId,
      adjustedAt: new Date(),
      recommendations,
      contentTypeWeights,
      platformFocus: sortedPlatforms,
      postingFrequencyAdjustment: frequencyAdjustment,
      optimalPostingTimes: OPTIMAL_POSTING_TIMES,
    };
  }

  /**
   * Flag a post for human review due to negative engagement.
   * Stub: persists to in-memory store. Replace with real notification/task system.
   *
   * Requirement 4.8
   */
  async flagForReview(postId: string, reason: string): Promise<void> {
    this.log(`Flagging post ${postId} for human review: ${reason}`);

    const flag: ReviewFlag = {
      postId,
      reason,
      flaggedAt: new Date(),
      status: 'pending',
    };

    reviewFlagStore.set(postId, flag);

    // Update the post status to reflect it needs review
    const post = postStore.get(postId);
    if (post) {
      postStore.set(postId, { ...post, status: 'failed' });
    }

    // Stub: in production, create a human review task / notification
    this.log(`Post ${postId} flagged for review — human action required`);
  }

  // -------------------------------------------------------------------------
  // Helpers for testing / inspection
  // -------------------------------------------------------------------------

  /** Retrieve a post from the in-memory store (useful for tests). */
  getPost(postId: string): SocialPost | undefined {
    return postStore.get(postId);
  }

  /** Retrieve a review flag from the in-memory store (useful for tests). */
  getReviewFlag(postId: string): ReviewFlag | undefined {
    return reviewFlagStore.get(postId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Build a platform-appropriate caption matching brand voice and local market.
   * Requirements: 4.2, 4.6
   */
  private _buildCaption(
    config: SocialMediaConfig,
    contentType: ContentType,
    platform: SocialPlatform
  ): string {
    const { businessName, industry, brandVoice, localMarket } = config;
    const { city } = localMarket;

    const voicePrefix: Record<BrandVoice, string> = {
      professional: `${businessName} is proud to serve the ${city} community.`,
      friendly: `Hey ${city}! 👋 ${businessName} here.`,
      casual: `What's up ${city}? ${businessName} checking in.`,
      authoritative: `${businessName} — the leading ${industry} experts in ${city}.`,
    };

    const contentBody: Record<ContentType, string> = {
      promotional: `Special offer for our ${city} customers! Contact us today for exclusive deals on our ${industry} services.`,
      educational: `Did you know? Here are 3 tips to help you get the most out of ${industry} services in ${city}.`,
      'behind-the-scenes': `Take a look behind the scenes at ${businessName}! Our team works hard every day to deliver the best ${industry} services in ${city}.`,
      testimonial: `⭐⭐⭐⭐⭐ "Amazing service!" — A happy ${city} customer. We love hearing from our community!`,
      community: `Proud to be part of the ${city} community! ${businessName} supports local businesses and residents every day.`,
    };

    // LinkedIn gets a more formal, longer-form caption
    if (platform === 'linkedin') {
      return `${voicePrefix[brandVoice]}\n\n${contentBody[contentType]}\n\nLearn more about how ${businessName} can help your business grow.`;
    }

    // Instagram gets a punchy, emoji-rich caption
    if (platform === 'instagram') {
      return `${contentBody[contentType]} ✨\n\n${voicePrefix[brandVoice]}`;
    }

    // Facebook gets a balanced caption
    return `${voicePrefix[brandVoice]} ${contentBody[contentType]}`;
  }

  /**
   * Build platform-appropriate hashtags.
   * Requirement 4.6
   */
  private _buildHashtags(
    config: SocialMediaConfig,
    contentType: ContentType,
    platform: SocialPlatform
  ): string[] {
    const { industry, localMarket } = config;
    const citySlug = localMarket.city.toLowerCase().replace(/\s+/g, '');

    const baseHashtags = [
      `#${industry.toLowerCase().replace(/\s+/g, '')}`,
      `#${citySlug}`,
      `#local${industry.toLowerCase().replace(/\s+/g, '')}`,
      `#smallbusiness`,
    ];

    const contentHashtags: Record<ContentType, string[]> = {
      promotional: ['#specialoffer', '#deal', '#discount'],
      educational: ['#tips', '#didyouknow', '#learnmore'],
      'behind-the-scenes': ['#behindthescenes', '#ourteam', '#worklife'],
      testimonial: ['#customerreview', '#happycustomer', '#testimonial'],
      community: ['#community', '#localfirst', '#supportlocal'],
    };

    // Instagram supports more hashtags; LinkedIn fewer
    const maxHashtags = platform === 'instagram' ? 10 : platform === 'linkedin' ? 5 : 7;

    return [...baseHashtags, ...contentHashtags[contentType]].slice(0, maxHashtags);
  }

  /**
   * Build placeholder media URLs for the post.
   * Stub: returns AI-generated image placeholders.
   */
  private _buildMediaUrls(
    config: SocialMediaConfig,
    contentType: ContentType,
    platform: SocialPlatform
  ): string[] {
    const slug = config.clientId.toLowerCase().replace(/\s+/g, '-');
    return [
      `https://media.example.com/${slug}/${platform}/${contentType}-1.jpg`,
    ];
  }

  /**
   * Calculate the next optimal posting time for a platform.
   * Requirement 4.5
   */
  private _nextOptimalTime(platform: SocialPlatform): Date {
    const times = OPTIMAL_POSTING_TIMES[platform];
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Pick the first optimal time slot tomorrow
    const timeStr = times[0];
    const [hours, minutes] = timeStr.split(':').map(Number);
    tomorrow.setHours(hours, minutes, 0, 0);

    return tomorrow;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const socialMediaAgent = new SocialMediaAgent();
