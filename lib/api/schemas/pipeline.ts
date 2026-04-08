/**
 * Zod Validation Schemas for Pipeline Endpoints
 */

import { z } from 'zod';

/**
 * Pipeline configuration schema
 */
export const pipelineConfigSchema = z.object({
  concurrencyLimit: z.number().int().min(1).max(100).default(10),
  batchSize: z.number().int().min(1).max(500).default(50),
  painScoreThreshold: z.number().int().min(0).max(100).default(60),
  dailyVolumeLimit: z.number().int().min(1).max(1000).default(200),
  spendingLimitCents: z.number().int().min(0).default(100000),
  hotLeadPercentile: z.number().int().min(0).max(100).default(95),
});

/**
 * Prospect lead schema
 */
export const prospectLeadSchema = z.object({
  businessName: z.string().min(1).max(200),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  city: z.string().optional(),
  industry: z.string().optional(),
  source: z.enum(['manual', 'import', 'discovery', 'partner']).default('manual'),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

/**
 * Partner configuration schema
 */
export const partnerConfigSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(255),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  apiKeys: z.array(z.string()).optional(),
  commissionRate: z.number().min(0).max(100).default(10),
  active: z.boolean().default(true),
});

/**
 * Pipeline chat message schema
 */
export const pipelineChatMessageSchema = z.object({
  prospectId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  context: z.string().optional(),
});

/**
 * Pipeline engagement schema
 */
export const pipelineEngagementSchema = z.object({
  prospectId: z.string().uuid(),
  eventType: z.enum([
    'email_opened',
    'link_clicked',
    'reply_received',
    'call_scheduled',
    'proposal_viewed',
  ]),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

/**
 * Export types
 */
export type PipelineConfigInput = z.infer<typeof pipelineConfigSchema>;
export type ProspectLeadInput = z.infer<typeof prospectLeadSchema>;
export type PartnerConfigInput = z.infer<typeof partnerConfigSchema>;
export type PipelineChatMessageInput = z.infer<typeof pipelineChatMessageSchema>;
export type PipelineEngagementInput = z.infer<typeof pipelineEngagementSchema>;
