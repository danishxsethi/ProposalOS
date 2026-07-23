/**
 * Reputation Management Agent
 *
 * AI-powered agent for monitoring and managing online reputation.
 * Stub implementation — no real external API calls are made.
 *
 * Key behaviours:
 *  - configureMonitoring: set up review monitoring across Google, Yelp, BBB, Facebook, industry-specific
 *  - getReviews: retrieve reviews with optional filters
 *  - analyzeSentiment: aggregate sentiment analysis with trend tracking
 *  - generateResponse: draft a response with confidence score
 *  - postResponse: auto-post for positive reviews (rating > 3), flag for human review for negative (≤ 3)
 *  - flagForHumanReview: escalate immediately (e.g. potential legal issues)
 *  - getReputationReport: monthly report with review volume, average rating, sentiment trends
 *  - identifyPatterns: surface insights for service improvement
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
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

export type ReviewPlatform = 'google' | 'yelp' | 'bbb' | 'facebook' | 'industry-specific';
export type ReviewSentiment = 'positive' | 'neutral' | 'negative';

export interface ReputationConfig {
  clientId: string;
  businessName: string;
  platforms: ReviewPlatform[];
  /** Sentiment score below which to alert (0–1 scale) */
  alertThreshold: number;
  autoRespondPositive: boolean;
  escalationEmail: string;
}

export interface ReviewFilters {
  platform?: ReviewPlatform;
  sentiment?: ReviewSentiment;
  responded?: boolean;
  dateRange?: DateRange;
  minRating?: number;
  maxRating?: number;
}

export interface Review {
  id: string;
  platform: ReviewPlatform;
  rating: number; // 1–5
  text: string;
  authorName: string;
  postedAt: Date;
  sentiment: ReviewSentiment;
  sentimentScore: number; // 0–1
  responded: boolean;
  responseText?: string;
  respondedAt?: Date;
}

export interface SentimentTrend {
  period: string; // e.g. "2024-01"
  averageSentimentScore: number;
  reviewCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export interface SentimentAnalysis {
  clientId: string;
  analyzedAt: Date;
  totalReviews: number;
  averageSentimentScore: number;
  averageRating: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  platformBreakdown: Record<ReviewPlatform, { count: number; averageRating: number }>;
  trends: SentimentTrend[];
  /** True when average sentiment score drops below the configured alertThreshold */
  alertTriggered: boolean;
}

export interface ResponseResult {
  reviewId: string;
  response: string;
  /** True when the response was automatically posted (positive review, rating > 3) */
  autoPosted: boolean;
  /** True when the response was held for human review (negative review, rating ≤ 3) */
  flaggedForReview: boolean;
  postedAt?: Date;
  flaggedAt?: Date;
}

export interface HumanReviewFlag {
  reviewId: string;
  reason: string;
  flaggedAt: Date;
  status: 'pending' | 'reviewed' | 'resolved';
  escalationEmail?: string;
}

export interface ReputationReport {
  clientId: string;
  dateRange: DateRange;
  generatedAt: Date;
  totalReviews: number;
  newReviews: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  sentimentTrends: SentimentTrend[];
  platformSummary: Record<ReviewPlatform, { count: number; averageRating: number; responded: number }>;
  responseRate: number; // 0–1
  topPositiveThemes: string[];
  topNegativeThemes: string[];
  recommendations: string[];
}

export interface ReviewPattern {
  theme: string;
  frequency: number;
  sentiment: ReviewSentiment;
  exampleReviewIds: string[];
  serviceImplication: string;
}

export interface ReviewPatterns {
  clientId: string;
  analyzedAt: Date;
  patterns: ReviewPattern[];
  recurringComplaints: string[];
  recurringPraise: string[];
  actionableInsights: string[];
}

// ---------------------------------------------------------------------------
// In-memory stores (stub — replace with DB persistence)
// ---------------------------------------------------------------------------

const monitoringConfigStore = new Map<string, ReputationConfig>();
const reviewStore = new Map<string, Review[]>(); // keyed by clientId
const responseResultStore = new Map<string, ResponseResult>(); // keyed by reviewId
const humanReviewFlagStore = new Map<string, HumanReviewFlag>(); // keyed by reviewId

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySentiment(rating: number): ReviewSentiment {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

function ratingToSentimentScore(rating: number): number {
  // Map 1–5 stars to 0–1 sentiment score
  return (rating - 1) / 4;
}

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------

export class ReputationAgent extends BaseDeliveryAgent {
  getAgentType(): DeliveryAgentType {
    return 'reputation';
  }

  /**
   * BaseDeliveryAgent.execute() entry point.
   * Configures monitoring and runs an initial sentiment analysis.
   */
  async execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    this.status = 'in_progress';

    const config = context.config as unknown as ReputationConfig;

    try {
      await this.configureMonitoring(config);

      // Seed stub reviews for the client so the agent has data to work with
      const reviews = await this.getReviews(config.clientId);
      const analysis = await this.analyzeSentiment(reviews);

      this.status = 'completed';

      return {
        success: true,
        summary: `Reputation monitoring configured for ${config.businessName} across ${config.platforms.length} platform(s)`,
        data: {
          platforms: config.platforms,
          totalReviews: analysis.totalReviews,
          averageRating: analysis.averageRating,
          alertTriggered: analysis.alertTriggered,
        },
        costCents: 75,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `Reputation monitoring setup failed: ${message}`,
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
   * Configure review monitoring for the specified platforms.
   * Stub: persists config to in-memory store. Replace with real platform API setup.
   *
   * Requirement 5.1
   */
  async configureMonitoring(config: ReputationConfig): Promise<void> {
    this.log(
      `Configuring monitoring for ${config.businessName} on platforms: ${config.platforms.join(', ')}`
    );

    monitoringConfigStore.set(config.clientId, config);

    // Seed stub reviews if none exist yet for this client
    if (!reviewStore.has(config.clientId)) {
      reviewStore.set(config.clientId, this._generateStubReviews(config));
    }

    this.log(`Monitoring configured for client ${config.clientId}`);
  }

  /**
   * Retrieve reviews for a client with optional filters.
   * Stub: returns from in-memory store. Replace with real platform API calls.
   *
   * Requirement 5.2
   */
  async getReviews(clientId: string, filters?: ReviewFilters): Promise<Review[]> {
    this.log(`Fetching reviews for client ${clientId}`);

    let reviews = reviewStore.get(clientId) ?? [];

    if (filters) {
      if (filters.platform) {
        reviews = reviews.filter((r) => r.platform === filters.platform);
      }
      if (filters.sentiment) {
        reviews = reviews.filter((r) => r.sentiment === filters.sentiment);
      }
      if (filters.responded !== undefined) {
        reviews = reviews.filter((r) => r.responded === filters.responded);
      }
      if (filters.minRating !== undefined) {
        reviews = reviews.filter((r) => r.rating >= filters.minRating!);
      }
      if (filters.maxRating !== undefined) {
        reviews = reviews.filter((r) => r.rating <= filters.maxRating!);
      }
      if (filters.dateRange) {
        reviews = reviews.filter(
          (r) =>
            r.postedAt >= filters.dateRange!.start &&
            r.postedAt <= filters.dateRange!.end
        );
      }
    }

    return reviews;
  }

  /**
   * Analyse sentiment across a set of reviews, including trend tracking.
   * Returns a SentimentAnalysis with per-platform breakdown and monthly trends.
   *
   * Requirement 5.2, 5.5
   */
  async analyzeSentiment(reviews: Review[]): Promise<SentimentAnalysis> {
    this.log(`Analysing sentiment for ${reviews.length} reviews`);

    const clientId =
      reviews.length > 0
        ? (monitoringConfigStore.get(reviews[0]?.id.split('-')[0]) ?? { clientId: 'unknown' })
            .clientId
        : 'unknown';

    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      return {
        clientId,
        analyzedAt: new Date(),
        totalReviews: 0,
        averageSentimentScore: 0,
        averageRating: 0,
        sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
        platformBreakdown: {} as Record<ReviewPlatform, { count: number; averageRating: number }>,
        trends: [],
        alertTriggered: false,
      };
    }

    // Aggregate sentiment counts
    const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
    let totalSentimentScore = 0;
    let totalRating = 0;

    for (const review of reviews) {
      sentimentBreakdown[review.sentiment]++;
      totalSentimentScore += review.sentimentScore;
      totalRating += review.rating;
    }

    const averageSentimentScore = totalSentimentScore / totalReviews;
    const averageRating = totalRating / totalReviews;

    // Per-platform breakdown
    const platformBreakdown = {} as Record<ReviewPlatform, { count: number; averageRating: number }>;
    const platforms: ReviewPlatform[] = ['google', 'yelp', 'bbb', 'facebook', 'industry-specific'];
    for (const platform of platforms) {
      const platformReviews = reviews.filter((r) => r.platform === platform);
      if (platformReviews.length > 0) {
        platformBreakdown[platform] = {
          count: platformReviews.length,
          averageRating:
            platformReviews.reduce((sum, r) => sum + r.rating, 0) / platformReviews.length,
        };
      }
    }

    // Monthly trend tracking
    const trendMap = new Map<string, { scores: number[]; ratings: number[]; sentiments: ReviewSentiment[] }>();
    for (const review of reviews) {
      const period = `${review.postedAt.getFullYear()}-${String(review.postedAt.getMonth() + 1).padStart(2, '0')}`;
      if (!trendMap.has(period)) {
        trendMap.set(period, { scores: [], ratings: [], sentiments: [] });
      }
      const entry = trendMap.get(period)!;
      entry.scores.push(review.sentimentScore);
      entry.ratings.push(review.rating);
      entry.sentiments.push(review.sentiment);
    }

    const trends: SentimentTrend[] = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        averageSentimentScore: data.scores.reduce((s, v) => s + v, 0) / data.scores.length,
        reviewCount: data.scores.length,
        positiveCount: data.sentiments.filter((s) => s === 'positive').length,
        neutralCount: data.sentiments.filter((s) => s === 'neutral').length,
        negativeCount: data.sentiments.filter((s) => s === 'negative').length,
      }));

    // Determine the clientId from the monitoring config if available
    let resolvedClientId = clientId;
    for (const [cid, cfg] of monitoringConfigStore.entries()) {
      if (reviews.some((r) => reviewStore.get(cid)?.includes(r))) {
        resolvedClientId = cid;
        break;
      }
    }

    // Check alert threshold
    const config = Array.from(monitoringConfigStore.values()).find((c) =>
      reviewStore.get(c.clientId)?.some((r) => reviews.includes(r))
    );
    const alertThreshold = config?.alertThreshold ?? 0.3;
    const alertTriggered = averageSentimentScore < alertThreshold;

    return {
      clientId: resolvedClientId,
      analyzedAt: new Date(),
      totalReviews,
      averageSentimentScore,
      averageRating,
      sentimentBreakdown,
      platformBreakdown,
      trends,
      alertTriggered,
    };
  }

  /**
   * Generate a professional response draft for a review, with a confidence score.
   * Stub: returns a synthesised response. Replace with real AI generation.
   *
   * Requirement 5.3, 5.4
   */
  async generateResponse(review: Review): Promise<{ response: string; confidence: number }> {
    this.log(`Generating response for review ${review.id} (rating: ${review.rating})`);

    const isPositive = review.rating > 3;

    let response: string;
    let confidence: number;

    if (isPositive) {
      response = `Thank you so much for your wonderful ${review.rating}-star review, ${review.authorName}! We're thrilled to hear about your positive experience and truly appreciate you taking the time to share your feedback. We look forward to serving you again!`;
      confidence = 0.92;
    } else if (review.rating === 3) {
      response = `Thank you for your feedback, ${review.authorName}. We appreciate you sharing your experience and are always looking for ways to improve. We'd love the opportunity to make things right — please don't hesitate to reach out to us directly.`;
      confidence = 0.78;
    } else {
      response = `We sincerely apologise for the experience you had, ${review.authorName}. Your feedback is important to us and we take all concerns seriously. We would like to resolve this for you — please contact us directly so we can make this right.`;
      confidence = 0.71;
    }

    return { response, confidence };
  }

  /**
   * Post a response to a review.
   *
   * Business rules (Requirements 5.3, 5.4):
   *  - Positive reviews (rating > 3): auto-post the response immediately.
   *  - Negative reviews (rating ≤ 3): flag for human review, do NOT auto-post.
   *
   * Returns a ResponseResult with autoPosted and flaggedForReview flags.
   */
  async postResponse(reviewId: string, response: string): Promise<ResponseResult> {
    this.log(`Processing response for review ${reviewId}`);

    // Look up the review to determine its rating
    let review: Review | undefined;
    for (const reviews of reviewStore.values()) {
      review = reviews.find((r) => r.id === reviewId);
      if (review) break;
    }

    // Default to flagging for human review if review not found (safe default)
    const rating = review?.rating ?? 0;
    const isPositive = rating > 3;

    const result: ResponseResult = {
      reviewId,
      response,
      autoPosted: isPositive,
      flaggedForReview: !isPositive,
      ...(isPositive ? { postedAt: new Date() } : { flaggedAt: new Date() }),
    };

    responseResultStore.set(reviewId, result);

    if (isPositive) {
      this.log(`Auto-posting response for positive review ${reviewId} (rating: ${rating})`);
      // Update the review as responded
      if (review) {
        review.responded = true;
        review.responseText = response;
        review.respondedAt = new Date();
      }
    } else {
      this.log(
        `Flagging review ${reviewId} (rating: ${rating}) for human review — NOT auto-posting`
      );
      // Flag for human review
      await this.flagForHumanReview(reviewId, `Negative review (rating: ${rating}) requires human review before posting`);
    }

    return result;
  }

  /**
   * Flag a review for immediate human review.
   * Used for negative reviews and potential legal issues.
   * Stub: persists to in-memory store. Replace with real notification/task system.
   *
   * Requirement 5.4, 5.8
   */
  async flagForHumanReview(reviewId: string, reason: string): Promise<void> {
    this.log(`Flagging review ${reviewId} for human review: ${reason}`);

    // Find the client config to get the escalation email
    let escalationEmail: string | undefined;
    for (const reviews of reviewStore.values()) {
      const found = reviews.find((r) => r.id === reviewId);
      if (found) {
        // Find the config for this client
        for (const [clientId, clientReviews] of reviewStore.entries()) {
          if (clientReviews.includes(found)) {
            escalationEmail = monitoringConfigStore.get(clientId)?.escalationEmail;
            break;
          }
        }
        break;
      }
    }

    const flag: HumanReviewFlag = {
      reviewId,
      reason,
      flaggedAt: new Date(),
      status: 'pending',
      escalationEmail,
    };

    humanReviewFlagStore.set(reviewId, flag);

    this.log(`Review ${reviewId} flagged — escalation email: ${escalationEmail ?? 'not configured'}`);
  }

  /**
   * Generate a monthly reputation report for a client.
   * Stub: returns synthesised report data. Replace with real analytics aggregation.
   *
   * Requirement 5.6
   */
  async getReputationReport(clientId: string, dateRange: DateRange): Promise<ReputationReport> {
    this.log(
      `Generating reputation report for client ${clientId} ` +
        `(${dateRange.start.toISOString()} – ${dateRange.end.toISOString()})`
    );

    const allReviews = await this.getReviews(clientId);
    const rangeReviews = allReviews.filter(
      (r) => r.postedAt >= dateRange.start && r.postedAt <= dateRange.end
    );

    const totalReviews = allReviews.length;
    const newReviews = rangeReviews.length;
    const averageRating =
      rangeReviews.length > 0
        ? rangeReviews.reduce((sum, r) => sum + r.rating, 0) / rangeReviews.length
        : 0;

    // Rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const review of rangeReviews) {
      const r = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
      ratingDistribution[r]++;
    }

    // Platform summary
    const platformSummary = {} as Record<ReviewPlatform, { count: number; averageRating: number; responded: number }>;
    const platforms: ReviewPlatform[] = ['google', 'yelp', 'bbb', 'facebook', 'industry-specific'];
    for (const platform of platforms) {
      const pReviews = rangeReviews.filter((r) => r.platform === platform);
      if (pReviews.length > 0) {
        platformSummary[platform] = {
          count: pReviews.length,
          averageRating: pReviews.reduce((sum, r) => sum + r.rating, 0) / pReviews.length,
          responded: pReviews.filter((r) => r.responded).length,
        };
      }
    }

    // Response rate
    const respondedCount = rangeReviews.filter((r) => r.responded).length;
    const responseRate = rangeReviews.length > 0 ? respondedCount / rangeReviews.length : 0;

    // Sentiment trends
    const analysis = await this.analyzeSentiment(rangeReviews);

    return {
      clientId,
      dateRange,
      generatedAt: new Date(),
      totalReviews,
      newReviews,
      averageRating,
      ratingDistribution,
      sentimentTrends: analysis.trends,
      platformSummary,
      responseRate,
      topPositiveThemes: ['Friendly staff', 'Fast service', 'Great value', 'Professional work'],
      topNegativeThemes: ['Wait times', 'Pricing concerns', 'Communication issues'],
      recommendations: [
        'Respond to all negative reviews within 24 hours',
        'Encourage satisfied customers to leave reviews',
        'Address recurring complaints about wait times',
        'Highlight positive themes in marketing materials',
      ],
    };
  }

  /**
   * Identify patterns in reviews and surface insights for service improvement.
   * Stub: returns synthesised patterns. Replace with real NLP analysis.
   *
   * Requirement 5.7
   */
  async identifyPatterns(clientId: string): Promise<ReviewPatterns> {
    this.log(`Identifying review patterns for client ${clientId}`);

    const reviews = await this.getReviews(clientId);

    const patterns: ReviewPattern[] = [
      {
        theme: 'Staff friendliness',
        frequency: reviews.filter((r) => r.sentiment === 'positive').length,
        sentiment: 'positive',
        exampleReviewIds: reviews
          .filter((r) => r.sentiment === 'positive')
          .slice(0, 3)
          .map((r) => r.id),
        serviceImplication: 'Continue investing in customer service training',
      },
      {
        theme: 'Response time',
        frequency: Math.ceil(reviews.length * 0.3),
        sentiment: 'negative',
        exampleReviewIds: reviews
          .filter((r) => r.sentiment === 'negative')
          .slice(0, 2)
          .map((r) => r.id),
        serviceImplication: 'Consider adding staff during peak hours to reduce wait times',
      },
      {
        theme: 'Value for money',
        frequency: Math.ceil(reviews.length * 0.25),
        sentiment: 'neutral',
        exampleReviewIds: reviews
          .filter((r) => r.sentiment === 'neutral')
          .slice(0, 2)
          .map((r) => r.id),
        serviceImplication: 'Review pricing strategy and communicate value proposition more clearly',
      },
    ];

    const positiveReviews = reviews.filter((r) => r.sentiment === 'positive');
    const negativeReviews = reviews.filter((r) => r.sentiment === 'negative');

    return {
      clientId,
      analyzedAt: new Date(),
      patterns,
      recurringComplaints: [
        'Long wait times',
        'Difficulty reaching staff by phone',
        'Pricing not clearly communicated upfront',
      ],
      recurringPraise: [
        'Friendly and professional staff',
        'High quality work',
        'Prompt follow-up',
      ],
      actionableInsights: [
        `${positiveReviews.length} positive reviews mention staff quality — use in marketing`,
        `${negativeReviews.length} negative reviews mention wait times — operational improvement needed`,
        'Consider implementing a follow-up survey to catch issues before they become reviews',
        'Respond to all reviews to show engagement and improve local SEO',
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Helpers for testing / inspection
  // -------------------------------------------------------------------------

  /** Retrieve the monitoring config for a client (useful for tests). */
  getMonitoringConfig(clientId: string): ReputationConfig | undefined {
    return monitoringConfigStore.get(clientId);
  }

  /** Retrieve a response result from the in-memory store (useful for tests). */
  getResponseResult(reviewId: string): ResponseResult | undefined {
    return responseResultStore.get(reviewId);
  }

  /** Retrieve a human review flag from the in-memory store (useful for tests). */
  getHumanReviewFlag(reviewId: string): HumanReviewFlag | undefined {
    return humanReviewFlagStore.get(reviewId);
  }

  /** Add a review directly to the store (useful for tests). */
  addReview(clientId: string, review: Review): void {
    const existing = reviewStore.get(clientId) ?? [];
    reviewStore.set(clientId, [...existing, review]);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Generate stub reviews for a newly configured client.
   * Produces a realistic mix of ratings across configured platforms.
   */
  private _generateStubReviews(config: ReputationConfig): Review[] {
    const reviews: Review[] = [];
    const now = new Date();

    const stubData = [
      { rating: 5, text: 'Excellent service! Highly recommend.', author: 'Jane D.' },
      { rating: 4, text: 'Very professional and prompt. Will use again.', author: 'Mark T.' },
      { rating: 5, text: 'Best in the area. Friendly staff and great results.', author: 'Sarah K.' },
      { rating: 2, text: 'Had to wait longer than expected. Not happy.', author: 'Bob M.' },
      { rating: 3, text: 'Decent service but pricing was a bit high.', author: 'Lisa R.' },
      { rating: 5, text: 'Outstanding work! Very satisfied.', author: 'Tom H.' },
      { rating: 1, text: 'Very disappointed. Would not recommend.', author: 'Carol P.' },
      { rating: 4, text: 'Good experience overall. Minor issues but resolved quickly.', author: 'David W.' },
    ];

    stubData.forEach((data, index) => {
      const platform = config.platforms[index % config.platforms.length];
      const postedAt = new Date(now.getTime() - (index + 1) * 7 * 24 * 60 * 60 * 1000);
      const sentiment = classifySentiment(data.rating);

      reviews.push({
        id: `review-${config.clientId}-${index + 1}`,
        platform,
        rating: data.rating,
        text: data.text,
        authorName: data.author,
        postedAt,
        sentiment,
        sentimentScore: ratingToSentimentScore(data.rating),
        responded: false,
      });
    });

    return reviews;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const reputationAgent = new ReputationAgent();
