/**
 * Zod Validation Schemas for Settings Endpoints
 */

import { z } from 'zod';

/**
 * API Key creation schema
 */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, { message: 'API key name is required' })
    .max(100, { message: 'API key name must be less than 100 characters' }),
  scopes: z
    .array(z.enum(['read', 'write', 'admin']))
    .min(1, { message: 'At least one scope is required' })
    .default(['read']),
  expiresAt: z.string().datetime().optional(),
});

/**
 * API Key update schema
 */
export const updateApiKeySchema = createApiKeySchema.partial();

/**
 * Notification settings schema
 */
export const notificationSettingsSchema = z.object({
  emailNotifications: z.boolean().default(true),
  slackWebhookUrl: z.string().url().optional().or(z.literal('')),
  slackChannel: z.string().max(100).optional(),
  notifyOnAuditComplete: z.boolean().default(true),
  notifyOnProposalView: z.boolean().default(true),
  notifyOnProposalAccept: z.boolean().default(true),
});

/**
 * Template configuration schema
 */
export const templateConfigSchema = z.object({
  name: z.string().min(1, { message: 'Template name is required' }).max(200),
  subject: z.string().min(5, { message: 'Subject must be at least 5 characters' }).max(200),
  body: z.string().min(50, { message: 'Body must be at least 50 characters' }).max(10000),
  variables: z.array(z.string()).optional(),
});

/**
 * Domain configuration schema
 */
export const domainConfigSchema = z.object({
  domain: z
    .string()
    .min(1, { message: 'Domain is required' })
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/, {
      message: 'Must be a valid domain (e.g., proposals.example.com)',
    }),
  verified: z.boolean().default(false),
  dnsRecords: z
    .object({
      type: z.string(),
      name: z.string(),
      value: z.string(),
    })
    .array()
    .optional(),
});

/**
 * Webhook configuration schema
 */
export const webhookConfigSchema = z.object({
  url: z.string().url({ message: 'Must be a valid URL' }),
  events: z
    .array(z.enum(['audit.completed', 'proposal.sent', 'proposal.viewed', 'proposal.accepted']))
    .min(1, { message: 'At least one event is required' }),
  secret: z
    .string()
    .min(16, { message: 'Webhook secret must be at least 16 characters' })
    .optional(),
  active: z.boolean().default(true),
});

/**
 * Export types
 */
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
export type TemplateConfigInput = z.infer<typeof templateConfigSchema>;
export type DomainConfigInput = z.infer<typeof domainConfigSchema>;
export type WebhookConfigInput = z.infer<typeof webhookConfigSchema>;
