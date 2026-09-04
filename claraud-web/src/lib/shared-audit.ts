/**
 * Shared audit module types and category mappings for Claraud Web
 */

export const CRITICAL_COMPLETION_MODULES = [
  'website',
  'gbp',
  'competitor',
  'reputation',
  'social',
] as const;

export type CriticalCompletionModuleId = (typeof CRITICAL_COMPLETION_MODULES)[number];

export const FRONTEND_AUDIT_CATEGORIES = [
  'website',
  'google',
  'seo',
  'reviews',
  'social',
  'competitors',
] as const;

export type FrontendAuditCategoryId = (typeof FRONTEND_AUDIT_CATEGORIES)[number];

export const FRONTEND_AUDIT_CATEGORY_MAP: Record<string, FrontendAuditCategoryId[]> = {
  website: ['website', 'seo'],
  gbp: ['google', 'reviews'],
  competitor: ['competitors'],
  reputation: ['reviews'],
  social: ['social'],
};

export function mapModuleToFrontendCategories(moduleId: string): string[] {
  return FRONTEND_AUDIT_CATEGORY_MAP[moduleId] || [moduleId];
}
