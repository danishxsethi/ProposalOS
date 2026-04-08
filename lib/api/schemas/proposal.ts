/**
 * Zod Validation Schemas for Proposal Endpoints
 */

import { z } from 'zod';

import { businessNameSchema, emailSchema } from './audit';

/**
 * Proposal status enum
 */
export const proposalStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CLOSED_WON',
  'CLOSED_LOST',
]);

/**
 * Proposal tier/plan schema
 */
export const proposalTierSchema = z.enum(['starter', 'professional', 'enterprise', 'custom']);

/**
 * Send proposal request schema (POST /api/proposal/[id]/send)
 */
export const sendProposalSchema = z.object({
  proposalId: z.string().uuid({ message: 'Invalid proposal ID format' }),
  recipientEmails: z
    .array(emailSchema)
    .min(1, { message: 'At least one recipient email is required' })
    .max(10, { message: 'Cannot send to more than 10 recipients at once' }),
  subject: z
    .string()
    .min(5, { message: 'Subject must be at least 5 characters' })
    .max(200, { message: 'Subject must be less than 200 characters' })
    .optional(),
  message: z
    .string()
    .max(2000, { message: 'Message must be less than 2000 characters' })
    .optional(),
  scheduleAt: z.string().datetime().optional(),
});

/**
 * Proposal contact form schema (POST /api/proposal/token/[token]/contact)
 */
export const proposalContactSchema = z.object({
  name: z
    .string()
    .min(2, { message: 'Name must be at least 2 characters' })
    .max(100, { message: 'Name must be less than 100 characters' }),
  email: emailSchema,
  phone: z
    .string()
    .min(10, { message: 'Phone number must be at least 10 digits' })
    .max(20, { message: 'Phone number seems too long' })
    .optional(),
  company: businessNameSchema.optional(),
  message: z
    .string()
    .max(1000, { message: 'Message must be less than 1000 characters' })
    .optional(),
});

/**
 * Proposal acceptance schema (POST /api/proposal/token/[token]/accept)
 */
export const acceptProposalSchema = z.object({
  contactName: z.string().min(2, { message: 'Name is required' }).max(100),
  contactEmail: emailSchema,
  contactPhone: z.string().optional(),
  companyName: businessNameSchema.optional(),
  message: z.string().max(1000).optional(),
  tier: proposalTierSchema,
  signature: z
    .boolean()
    .refine((val) => val === true, { message: 'You must accept the terms to proceed' }),
});

/**
 * Proposal tracking event schema (POST /api/proposal/token/[token]/track)
 */
export const proposalTrackEventSchema = z.enum([
  'view',
  'scroll',
  'time',
  'cta',
  'expand',
  'presentation_slide',
  'clicked',
  'downloaded',
  'shared',
  'commented',
]);

export const proposalTrackSchema = z.object({
  event: proposalTrackEventSchema,
  sessionId: z.string().min(1, { message: 'Session ID is required' }).max(255),
  scrollDepth: z.number().min(0).max(100).optional(),
  timeOnPageSeconds: z.number().positive().optional(),
  ctaClicked: z.boolean().optional(),
  slideIndex: z.number().positive().optional(),
  expandedSections: z.array(z.string()).optional(),
  referrer: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Proposal email send schema (POST /api/proposal/token/[token]/email)
 */
export const proposalEmailSchema = z.object({
  email: emailSchema,
});

/**
 * Proposal share schema (POST /api/proposal/token/[token]/share)
 */
export const proposalShareSchema = z.object({
  platform: z.enum([
    'twitter',
    'linkedin',
    'facebook',
    'email',
    'copy',
    'whatsapp',
    'slack',
    'teams',
  ]),
});

/**
 * Proposal outcome schema (POST /api/proposal/id/[id]/outcome)
 */
export const proposalOutcomeSchema = z.object({
  outcome: z.enum(['won', 'lost', 'pending']),
  value: z.number().positive().optional(),
  lostReason: z
    .enum(['price', 'timing', 'competitor', 'not_decision_maker', 'no_longer_interested', 'other'])
    .optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * Proposal chat message schema (POST /api/proposal/[id]/chat)
 */
export const proposalChatMessageSchema = z.object({
  message: z
    .string()
    .min(1, { message: 'Message cannot be empty' })
    .max(2000, { message: 'Message must be less than 2000 characters' }),
  sessionId: z.string().min(1, { message: 'Session ID is required' }).max(255),
});

/**
 * Proposal generation options schema
 */
export const proposalGenerateOptionsSchema = z.object({
  templateId: z.string().uuid().optional(),
  includePricing: z.boolean().default(true),
  includeTimeline: z.boolean().default(true),
  includeCaseStudies: z.boolean().default(false),
  tone: z.enum(['professional', 'friendly', 'direct', 'consultative']).default('professional'),
  customSections: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        content: z.string().min(1).max(5000),
      })
    )
    .optional(),
});

/**
 * Client portal data query schema (GET /api/client/portal/data)
 */
export const clientPortalDataQuerySchema = z.object({
  token: z.string().min(1).optional(),
  auditId: z.string().uuid().optional(),
});

/**
 * Client scan request schema (POST /api/client/scan)
 */
export const clientScanSchema = z.object({
  url: z.string().url({ message: 'Valid URL required' }),
  businessName: businessNameSchema.optional(),
  email: emailSchema.optional(),
});

/**
 * Client improvement request schema (POST /api/client/improvement/[auditId])
 */
export const clientImprovementSchema = z.object({
  findingIds: z.array(z.string().uuid()).min(1, { message: 'At least one finding ID is required' }),
  notes: z.string().max(500).optional(),
});

/**
 * Export types
 */
export type SendProposalInput = z.infer<typeof sendProposalSchema>;
export type ProposalContactInput = z.infer<typeof proposalContactSchema>;
export type AcceptProposalInput = z.infer<typeof acceptProposalSchema>;
export type ProposalTrackInput = z.infer<typeof proposalTrackSchema>;
export type ProposalOutcomeInput = z.infer<typeof proposalOutcomeSchema>;
export type ProposalChatInput = z.infer<typeof proposalChatMessageSchema>;
export type ProposalGenerateOptions = z.infer<typeof proposalGenerateOptionsSchema>;
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type ProposalTier = z.infer<typeof proposalTierSchema>;
export type ClientPortalDataInput = z.infer<typeof clientPortalDataQuerySchema>;
export type ClientScanInput = z.infer<typeof clientScanSchema>;
export type ClientImprovementInput = z.infer<typeof clientImprovementSchema>;
