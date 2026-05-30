/**
 * Zod Validation Schemas for Audit Endpoints
 */

import { z } from 'zod';

/**
 * URL validation with comprehensive protocol and format checking
 */
export const urlSchema = z
  .string()
  .url({
    message: 'Must be a valid URL including protocol (http:// or https://)',
  })
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL must use http:// or https:// protocol' }
  );

/**
 * Business name validation
 */
export const businessNameSchema = z
  .string()
  .min(2, { message: 'Business name must be at least 2 characters' })
  .max(200, { message: 'Business name must be less than 200 characters' })
  .regex(/^[\p{L}\p{N}\s&,'-]+$/u, {
    message: 'Business name can only contain letters, numbers, spaces, and basic punctuation',
  });

/**
 * Phone number validation (North American format)
 */
export const phoneSchema = z
  .string()
  .min(10, { message: 'Phone number must be at least 10 digits' })
  .max(20, { message: 'Phone number seems too long' })
  .regex(/^[\d\s()+-]*$/, {
    message: 'Phone number can only contain digits, spaces, and basic punctuation',
  });

/**
 * Email validation
 */
export const emailSchema = z.string().email({ message: 'Must be a valid email address' });

/**
 * City/location validation
 */
export const citySchema = z
  .string()
  .min(2, { message: 'City must be at least 2 characters' })
  .max(100, { message: 'City must be less than 100 characters' })
  .optional();

/**
 * Industry/category validation
 */
export const industrySchema = z
  .string()
  .min(2, { message: 'Industry must be at least 2 characters' })
  .max(100, { message: 'Industry must be less than 100 characters' })
  .optional();

/**
 * Place ID for Google Maps integration
 */
export const placeIdSchema = z
  .string()
  .min(1, { message: 'Place ID is required' })
  .max(300, { message: 'Place ID seems too long' })
  .optional();

/**
 * Audit trigger request schema (POST /api/audit)
 */
export const auditTriggerSchema = z.object({
  url: urlSchema,
  businessName: businessNameSchema.optional(),
  placeId: placeIdSchema,
  industry: industrySchema,
  businessCity: citySchema,
  businessPhone: phoneSchema.optional(),
  businessEmail: emailSchema.optional(),
  // Internal fields
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  skipCache: z.boolean().default(false),
});

/**
 * Batch audit request schema (POST /api/audit/batch)
 */
export const batchAuditItemSchema = z.object({
  url: urlSchema,
  businessName: businessNameSchema.optional(),
  placeId: placeIdSchema,
});

export const batchAuditSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Batch name is required' })
    .max(200, { message: 'Batch name must be less than 200 characters' }),
  items: z
    .array(batchAuditItemSchema)
    .min(1, { message: 'Batch must contain at least 1 item' })
    .max(100, { message: 'Batch cannot exceed 100 items' }),
});

/**
 * Audit comparison schema (GET /api/audit/[id]/compare/[previousId])
 */
export const auditCompareSchema = z.object({
  auditId: z.string().uuid({ message: 'Invalid audit ID format' }),
  previousId: z.string().uuid({ message: 'Invalid previous audit ID format' }),
});

/**
 * Audit regeneration schema (POST /api/audit/[id]/regenerate)
 */
export const auditRegenerateSchema = z.object({
  auditId: z.string().uuid({ message: 'Invalid audit ID format' }),
  regenerateFindings: z.boolean().default(true),
  regenerateProposal: z.boolean().default(false),
});

/**
 * Quick audit schema for widget (POST /api/widget/quick-audit)
 */
export const quickAuditSchema = z
  .object({
    url: urlSchema.optional(),
    websiteUrl: urlSchema.optional(),
    email: emailSchema.optional(),
    businessName: businessNameSchema.optional(),
    tenantDomain: z.string().min(1, { message: 'Tenant domain is required' }).max(255).optional(),
    tenantId: z.string().min(1, { message: 'Tenant ID is required' }).max(255).optional(),
    source: z.string().url().optional(),
  })
  .refine((data) => Boolean(data.url || data.websiteUrl), {
    message: 'A valid URL is required',
    path: ['url'],
  })
  .refine((data) => Boolean(data.tenantDomain || data.tenantId), {
    message: 'A tenant identifier is required',
    path: ['tenantDomain'],
  });

/**
 * Pagination parameters schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'businessName']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Combined audit query parameters schema
 */
export const auditQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  search: z.string().max(100).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

/**
 * Audit status response schema
 */
export const auditStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);

/**
 * Audit finding severity schema
 */
export const findingSeveritySchema = z.enum(['critical', 'major', 'minor', 'info']);

/**
 * Audit finding category schema
 */
export const findingCategorySchema = z.enum([
  'accessibility',
  'seo',
  'performance',
  'security',
  'ux',
  'content',
  'technical',
]);

/**
 * Export types for use in API routes
 */
export type AuditTriggerInput = z.infer<typeof auditTriggerSchema>;
export type BatchAuditInput = z.infer<typeof batchAuditSchema>;
export type BatchAuditItemInput = z.infer<typeof batchAuditItemSchema>;
export type QuickAuditInput = z.infer<typeof quickAuditSchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
