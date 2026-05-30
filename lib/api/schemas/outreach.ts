/**
 * Zod Validation Schemas for Outreach Endpoints
 */

import { z } from 'zod';

/**
 * Lead import schema
 */
export const leadImportSchema = z.object({
  leads: z
    .array(
      z.object({
        businessName: z.string().min(1).max(200),
        websiteUrl: z.string().url().optional().or(z.literal('')),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        industry: z.string().optional(),
        employeeCount: z.number().int().optional(),
        revenue: z.string().optional(),
        linkedInUrl: z.string().url().optional().or(z.literal('')),
        notes: z.string().max(1000).optional(),
      })
    )
    .min(1)
    .max(1000),
  listName: z.string().min(1).max(200),
  tags: z.array(z.string()).optional(),
});

/**
 * Outreach campaign schema
 */
export const outreachCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  subjectLine: z.string().min(5).max(100),
  bodyTemplate: z.string().min(50).max(5000),
  fromName: z.string().min(1).max(100),
  fromEmail: z.string().email(),
  replyToEmail: z.string().email().optional(),
  scheduleType: z.enum(['immediate', 'scheduled', 'drip']),
  scheduledAt: z.string().datetime().optional(),
  dripIntervalDays: z.number().int().min(1).max(30).optional(),
  dripCount: z.number().int().min(1).max(10).optional(),
  targetSegment: z
    .object({
      industries: z.array(z.string()).optional(),
      locations: z.array(z.string()).optional(),
      employeeCountMin: z.number().int().optional(),
      employeeCountMax: z.number().int().optional(),
    })
    .optional(),
});

/**
 * Outreach follow-up schema
 */
export const outreachFollowUpSchema = z.object({
  campaignId: z.string().uuid(),
  leadId: z.string().uuid(),
  message: z.string().min(10).max(2000),
  channel: z.enum(['email', 'phone', 'linkedin']),
  scheduledAt: z.string().datetime().optional(),
});

/**
 * Outreach scorecard schema
 */
export const outreachScorecardSchema = z.object({
  leadId: z.string().uuid(),
  fitScore: z.number().int().min(0).max(100),
  engagementScore: z.number().int().min(0).max(100),
  painScore: z.number().int().min(0).max(100),
  budgetScore: z.number().int().min(0).max(100),
  authorityScore: z.number().int().min(0).max(100),
  notes: z.string().max(2000).optional(),
  nextAction: z.enum(['call', 'email', 'proposal', 'disqualify', 'nurture']).optional(),
  nextActionDate: z.string().datetime().optional(),
});

/**
 * Outreach sniper (targeted) schema
 */
export const outreachSniperSchema = z.object({
  targetUrl: z.string().url(),
  criteria: z.object({
    minEmployees: z.number().int().optional(),
    maxEmployees: z.number().int().optional(),
    industries: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    technologies: z.array(z.string()).optional(),
  }),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Outreach tracking schema
 */
export const outreachTrackSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([
    'sent',
    'delivered',
    'opened',
    'clicked',
    'replied',
    'bounced',
    'unsubscribed',
  ]),
  campaignId: z.string().uuid().optional(),
  leadId: z.string().uuid(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Export types
 */
export type LeadImportInput = z.infer<typeof leadImportSchema>;
export type OutreachCampaignInput = z.infer<typeof outreachCampaignSchema>;
export type OutreachFollowUpInput = z.infer<typeof outreachFollowUpSchema>;
export type OutreachScorecardInput = z.infer<typeof outreachScorecardSchema>;
export type OutreachSniperInput = z.infer<typeof outreachSniperSchema>;
export type OutreachTrackInput = z.infer<typeof outreachTrackSchema>;
