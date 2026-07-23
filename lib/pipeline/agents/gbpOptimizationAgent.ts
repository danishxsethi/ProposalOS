/**
 * GBP Optimization Agent
 *
 * AI-powered agent for managing Google Business Profile listings.
 * Stub implementation — no real Google API calls are made.
 *
 * Key behaviours:
 *  - verifyClaimStatus: checks whether a GBP listing is claimed/claimable
 *  - optimizeProfile: updates hours, categories, attributes, description
 *  - generateAndUploadPhotos: AI image generation fallback when no assets provided
 *  - schedulePost: creates GBP posts on a configurable cadence
 *  - respondToReview: auto-posts for positive (4+ stars), flags for human review for negative (≤3 stars)
 *  - answerQuestion: responds to Q&A questions
 *  - getPerformanceMetrics: returns GBPMetrics for a date range
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
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

export interface GBPOptimizationConfig {
  clientId: string;
  placeId: string;
  businessName: string;
  industry: string;
  targetKeywords: string[];
}

export interface ClaimStatus {
  claimed: boolean;
  claimable: boolean;
}

export interface ClaimResult {
  success: boolean;
  claimId?: string;
  message: string;
  initiatedAt: Date;
}

export interface OptimizationResult {
  success: boolean;
  updatedFields: string[];
  message: string;
  optimizedAt: Date;
}

export interface PhotoUploadResult {
  success: boolean;
  uploadedCount: number;
  photoUrls: string[];
  source: 'client-assets' | 'ai-generated';
  uploadedAt: Date;
}

export interface PostContent {
  title: string;
  body: string;
  callToAction?: string;
  mediaUrl?: string;
}

export interface ScheduledPost {
  id: string;
  placeId: string;
  content: PostContent;
  scheduledAt: Date;
  status: 'scheduled' | 'posted' | 'failed';
  cadenceDays: number;
}

export interface ReviewResponse {
  reviewId: string;
  response: string;
  /** True when the response was automatically posted (positive review, 4+ stars) */
  autoPosted: boolean;
  /** True when the response was held for human review (negative review, ≤3 stars) */
  flaggedForReview: boolean;
  respondedAt: Date;
}

export interface QAResponse {
  questionId: string;
  answer: string;
  postedAt: Date;
  success: boolean;
}

export interface GBPMetrics {
  views: number;
  searches: number;
  websiteClicks: number;
  directionRequests: number;
  phoneCalls: number;
  photoViews: number;
  reviewCount: number;
  averageRating: number;
}

// ---------------------------------------------------------------------------
// In-memory stores (stub — replace with DB persistence)
// ---------------------------------------------------------------------------

const scheduledPostStore = new Map<string, ScheduledPost>();
const reviewResponseStore = new Map<string, ReviewResponse>();
const qaResponseStore = new Map<string, QAResponse>();

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------

export class GBPOptimizationAgent extends BaseDeliveryAgent {
  getAgentType(): DeliveryAgentType {
    return 'gbp_optimization';
  }

  /**
   * BaseDeliveryAgent.execute() entry point.
   * Runs the full GBP optimisation pipeline for a client.
   */
  async execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    this.status = 'in_progress';

    const config = context.config as unknown as GBPOptimizationConfig;

    try {
      // 1. Verify claim status
      const claimStatus = await this.verifyClaimStatus(config.placeId);

      // 2. Optimise the profile
      const optimizationResult = await this.optimizeProfile(config);

      // 3. Generate and upload photos (no client assets provided in base flow)
      const photoResult = await this.generateAndUploadPhotos(config);

      this.status = 'completed';

      return {
        success: true,
        summary: `GBP profile optimised for ${config.businessName}`,
        data: {
          claimStatus,
          optimizationResult,
          photoResult,
        },
        costCents: 150, // stub cost
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `GBP optimisation failed: ${message}`,
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
   * Verify whether a GBP listing is claimed and/or claimable.
   * Stub: returns synthesised data. Replace with real Google Business Profile API call.
   *
   * Requirement 2.1
   */
  async verifyClaimStatus(placeId: string): Promise<ClaimStatus> {
    this.log(`Verifying claim status for placeId: ${placeId}`);

    // Stub: simulate API response
    return {
      claimed: false,
      claimable: true,
    };
  }

  /**
   * Initiate the GBP claim process for an unclaimed listing.
   * Stub: returns a synthesised claim result.
   *
   * Requirement 2.1
   */
  async initiateClaimProcess(config: GBPOptimizationConfig): Promise<ClaimResult> {
    this.log(`Initiating claim process for ${config.businessName} (${config.placeId})`);

    return {
      success: true,
      claimId: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message: `Claim process initiated for ${config.businessName}`,
      initiatedAt: new Date(),
    };
  }

  /**
   * Optimise the GBP profile: update hours, categories, attributes, and description.
   * Stub: returns a list of updated fields. Replace with real GBP Management API calls.
   *
   * Requirement 2.2
   */
  async optimizeProfile(config: GBPOptimizationConfig): Promise<OptimizationResult> {
    this.log(`Optimising GBP profile for ${config.businessName}`);

    const updatedFields = [
      'businessHours',
      'categories',
      'attributes',
      'description',
    ];

    return {
      success: true,
      updatedFields,
      message: `Profile optimised with industry best practices for ${config.industry}`,
      optimizedAt: new Date(),
    };
  }

  /**
   * Generate and upload optimised photos.
   * Uses client-provided assets when available; falls back to AI image generation.
   *
   * Requirement 2.3
   */
  async generateAndUploadPhotos(
    config: GBPOptimizationConfig,
    assets?: string[]
  ): Promise<PhotoUploadResult> {
    this.log(`Generating/uploading photos for ${config.businessName}`);

    const hasClientAssets = assets && assets.length > 0;
    const source: 'client-assets' | 'ai-generated' = hasClientAssets
      ? 'client-assets'
      : 'ai-generated';

    // Stub: use provided assets or generate placeholder AI image URLs
    const photoUrls: string[] = hasClientAssets
      ? assets!
      : [
          `https://ai-images.example.com/${config.placeId}/photo-1.jpg`,
          `https://ai-images.example.com/${config.placeId}/photo-2.jpg`,
          `https://ai-images.example.com/${config.placeId}/photo-3.jpg`,
        ];

    return {
      success: true,
      uploadedCount: photoUrls.length,
      photoUrls,
      source,
      uploadedAt: new Date(),
    };
  }

  /**
   * Schedule a GBP post on a configurable cadence.
   * Stub: persists to in-memory store. Replace with real GBP Posts API call.
   *
   * Requirement 2.4
   */
  async schedulePost(
    config: GBPOptimizationConfig,
    content: PostContent,
    cadenceDays = 7
  ): Promise<ScheduledPost> {
    this.log(`Scheduling GBP post for ${config.businessName}`);

    const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scheduledAt = new Date(Date.now() + cadenceDays * 24 * 60 * 60 * 1000);

    const post: ScheduledPost = {
      id,
      placeId: config.placeId,
      content,
      scheduledAt,
      status: 'scheduled',
      cadenceDays,
    };

    scheduledPostStore.set(id, post);

    return post;
  }

  /**
   * Respond to a GBP review.
   *
   * Business rules (Requirements 2.5, 2.6):
   *  - Positive sentiment (4+ stars): auto-post the response immediately.
   *  - Negative sentiment (≤3 stars): flag for human review, do NOT auto-post.
   *
   * Returns a ReviewResponse with autoPosted and flaggedForReview flags.
   */
  async respondToReview(
    reviewId: string,
    sentiment: 'positive' | 'negative',
    draftResponse: string
  ): Promise<ReviewResponse> {
    this.log(`Responding to review ${reviewId} (sentiment: ${sentiment})`);

    const isPositive = sentiment === 'positive';

    const response: ReviewResponse = {
      reviewId,
      response: draftResponse,
      autoPosted: isPositive,
      flaggedForReview: !isPositive,
      respondedAt: new Date(),
    };

    reviewResponseStore.set(reviewId, response);

    if (isPositive) {
      this.log(`Auto-posting response for positive review ${reviewId}`);
      // Stub: in production, call GBP Reviews API to post the response
    } else {
      this.log(`Flagging negative review ${reviewId} for human review — NOT auto-posting`);
      // Stub: in production, create a human review task / notification
    }

    return response;
  }

  /**
   * Answer a Q&A question on the GBP listing.
   * Stub: persists to in-memory store. Replace with real GBP Q&A API call.
   *
   * Requirement 2.7
   */
  async answerQuestion(questionId: string, answer: string): Promise<QAResponse> {
    this.log(`Answering question ${questionId}`);

    const qaResponse: QAResponse = {
      questionId,
      answer,
      postedAt: new Date(),
      success: true,
    };

    qaResponseStore.set(questionId, qaResponse);

    return qaResponse;
  }

  /**
   * Retrieve GBP performance metrics for a given date range.
   * Stub: returns synthesised metrics. Replace with real GBP Insights API call.
   *
   * Requirement 2.8
   */
  async getPerformanceMetrics(
    placeId: string,
    dateRange: DateRange
  ): Promise<GBPMetrics> {
    this.log(
      `Fetching performance metrics for placeId ${placeId} ` +
        `(${dateRange.start.toISOString()} – ${dateRange.end.toISOString()})`
    );

    // Stub: return synthesised metrics
    return {
      views: 1240,
      searches: 870,
      websiteClicks: 95,
      directionRequests: 42,
      phoneCalls: 31,
      photoViews: 560,
      reviewCount: 18,
      averageRating: 4.3,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers for testing / inspection
  // -------------------------------------------------------------------------

  /** Retrieve a scheduled post from the in-memory store (useful for tests). */
  getScheduledPost(postId: string): ScheduledPost | undefined {
    return scheduledPostStore.get(postId);
  }

  /** Retrieve a review response from the in-memory store (useful for tests). */
  getReviewResponse(reviewId: string): ReviewResponse | undefined {
    return reviewResponseStore.get(reviewId);
  }

  /** Retrieve a Q&A response from the in-memory store (useful for tests). */
  getQAResponse(questionId: string): QAResponse | undefined {
    return qaResponseStore.get(questionId);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const gbpOptimizationAgent = new GBPOptimizationAgent();
