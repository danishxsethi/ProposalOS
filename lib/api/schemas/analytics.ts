/**
 * Zod Validation Schemas for Analytics Endpoints
 */

import { z } from 'zod';

/**
 * Cart abandonment event schema
 */
export const cartAbandonmentSchema = z.object({
  auditId: z.string().uuid(),
  proposalId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  step: z.enum(['scan', 'report', 'proposal', 'checkout', 'payment']),
  reason: z.enum(['price', 'timing', 'features', 'competitor', 'other']).optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

/**
 * Upsell event schema
 */
export const upsellEventSchema = z.object({
  proposalId: z.string().uuid(),
  originalTier: z.enum(['starter', 'professional', 'enterprise']),
  targetTier: z.enum(['starter', 'professional', 'enterprise']),
  incentive: z.string().optional(),
  outcome: z.enum(['accepted', 'declined', 'pending']).optional(),
  timestamp: z.string().datetime().optional(),
});

/**
 * Benchmark query schema
 */
export const benchmarkQuerySchema = z.object({
  industry: z.string().optional(),
  location: z.string().optional(),
  employeeCount: z.string().optional(),
  metrics: z.array(z.enum(['seo', 'accessibility', 'performance', 'conversion'])).default(['seo']),
  limit: z.number().int().min(1).max(100).default(50),
});

/**
 * Win/loss analysis schema
 */
export const winLossSchema = z.object({
  proposalId: z.string().uuid(),
  outcome: z.enum(['won', 'lost', 'pending']),
  reason: z
    .enum(['price', 'features', 'timing', 'competitor', 'budget', 'decision_maker'])
    .optional(),
  competitorName: z.string().optional(),
  dealValue: z.number().optional(),
  salesCycleDays: z.number().int().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Analytics date range schema
 */
export const analyticsDateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  timezone: z.string().default('UTC'),
});

/**
 * Analytics aggregation schema
 */
export const analyticsAggregationSchema = z.object({
  metric: z.enum(['audits', 'proposals', 'conversions', 'revenue', 'engagement']),
  granularity: z.enum(['hour', 'day', 'week', 'month', 'year']),
  groupBy: z.array(z.enum(['industry', 'location', 'tier', 'source'])).optional(),
});

/**
 * Export types
 */
export type CartAbandonmentInput = z.infer<typeof cartAbandonmentSchema>;
export type UpsellEventInput = z.infer<typeof upsellEventSchema>;
export type BenchmarkQueryInput = z.infer<typeof benchmarkQuerySchema>;
export type WinLossInput = z.infer<typeof winLossSchema>;
export type AnalyticsDateRangeInput = z.infer<typeof analyticsDateRangeSchema>;
export type AnalyticsAggregationInput = z.infer<typeof analyticsAggregationSchema>;
