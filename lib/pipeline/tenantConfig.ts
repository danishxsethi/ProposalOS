/**
 * Tenant Configuration Management
 * 
 * Provides CRUD operations for PipelineConfig, tenant onboarding with sensible defaults,
 * and tenant branding application to outreach emails and proposals.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { prisma } from '@/lib/db';
import type { PipelineConfig, TenantBranding, Tenant } from '@prisma/client';

export interface PipelineConfigInput {
  concurrencyLimit?: number;
  batchSize?: number;
  painScoreThreshold?: number;
  dailyVolumeLimit?: number;
  spendingLimitCents?: number;
  hotLeadPercentile?: number;
  emailMinQualityScore?: number;
  maxEmailsPerDomainPerDay?: number;
  followUpSchedule?: number[];
  pausedStages?: string[];
  country?: string;
  language?: string;
  currency?: string;
  pricingMultiplier?: number;
}

export interface TenantConfigResult {
  config: PipelineConfig;
  branding: TenantBranding | null;
  tenant: Tenant;
}

/**
 * Get pipeline configuration for a tenant
 * Requirement 9.2: Allow tenant to configure pipeline settings
 */
export async function getPipelineConfig(tenantId: string): Promise<PipelineConfig | null> {
  return prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
}

/**
 * Get complete tenant configuration including branding
 * Requirement 9.3, 9.4: Apply tenant branding to outreach and proposals
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfigResult | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      pipelineConfig: true,
      branding: true,
    },
  });

  if (!tenant) {
    return null;
  }

  return {
    config: tenant.pipelineConfig!,
    branding: tenant.branding,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    } as Tenant,
  };
}

/**
 * Create or update pipeline configuration for a tenant
 * Requirement 9.2: Allow tenant to configure pipeline settings
 * Requirement 9.6: Validate configuration changes
 */
export async function upsertPipelineConfig(
  tenantId: string,
  input: PipelineConfigInput
): Promise<PipelineConfig> {
  // Validate configuration
  validatePipelineConfig(input);

  // Prepare data for upsert
  const data: any = {};

  if (input.concurrencyLimit !== undefined) data.concurrencyLimit = input.concurrencyLimit;
  if (input.batchSize !== undefined) data.batchSize = input.batchSize;
  if (input.painScoreThreshold !== undefined) data.painScoreThreshold = input.painScoreThreshold;
  if (input.dailyVolumeLimit !== undefined) data.dailyVolumeLimit = input.dailyVolumeLimit;
  if (input.spendingLimitCents !== undefined) data.spendingLimitCents = input.spendingLimitCents;
  if (input.hotLeadPercentile !== undefined) data.hotLeadPercentile = input.hotLeadPercentile;
  if (input.emailMinQualityScore !== undefined) data.emailMinQualityScore = input.emailMinQualityScore;
  if (input.maxEmailsPerDomainPerDay !== undefined) data.maxEmailsPerDomainPerDay = input.maxEmailsPerDomainPerDay;
  if (input.followUpSchedule !== undefined) data.followUpSchedule = input.followUpSchedule;
  if (input.pausedStages !== undefined) data.pausedStages = input.pausedStages;
  if (input.country !== undefined) data.country = input.country;
  if (input.language !== undefined) data.language = input.language;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.pricingMultiplier !== undefined) data.pricingMultiplier = input.pricingMultiplier;

  return prisma.pipelineConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      ...data,
    },
    update: data,
  });
}

/**
 * Validate pipeline configuration input
 * Requirement 9.6: Validate configuration changes
 */
function validatePipelineConfig(input: PipelineConfigInput): void {
  if (input.concurrencyLimit !== undefined && (input.concurrencyLimit < 1 || input.concurrencyLimit > 100)) {
    throw new Error('Concurrency limit must be between 1 and 100');
  }

  if (input.batchSize !== undefined && (input.batchSize < 1 || input.batchSize > 1000)) {
    throw new Error('Batch size must be between 1 and 1000');
  }

  if (input.painScoreThreshold !== undefined && (input.painScoreThreshold < 0 || input.painScoreThreshold > 100)) {
    throw new Error('Pain score threshold must be between 0 and 100');
  }

  if (input.dailyVolumeLimit !== undefined && input.dailyVolumeLimit < 0) {
    throw new Error('Daily volume limit must be non-negative');
  }

  if (input.spendingLimitCents !== undefined && input.spendingLimitCents < 0) {
    throw new Error('Spending limit must be non-negative');
  }

  if (input.hotLeadPercentile !== undefined && (input.hotLeadPercentile < 0 || input.hotLeadPercentile > 100)) {
    throw new Error('Hot lead percentile must be between 0 and 100');
  }

  if (input.emailMinQualityScore !== undefined && (input.emailMinQualityScore < 0 || input.emailMinQualityScore > 100)) {
    throw new Error('Email min quality score must be between 0 and 100');
  }

  if (input.maxEmailsPerDomainPerDay !== undefined && input.maxEmailsPerDomainPerDay < 1) {
    throw new Error('Max emails per domain per day must be at least 1');
  }

  if (input.followUpSchedule !== undefined) {
    if (!Array.isArray(input.followUpSchedule)) {
      throw new Error('Follow-up schedule must be an array');
    }
    if (input.followUpSchedule.some(day => day < 0)) {
      throw new Error('Follow-up schedule days must be non-negative');
    }
  }

  if (input.pausedStages !== undefined && !Array.isArray(input.pausedStages)) {
    throw new Error('Paused stages must be an array');
  }

  if (input.pricingMultiplier !== undefined && (input.pricingMultiplier < 0.1 || input.pricingMultiplier > 10)) {
    throw new Error('Pricing multiplier must be between 0.1 and 10');
  }

  const validCountries = ['US', 'UK', 'CA'];
  if (input.country !== undefined && !validCountries.includes(input.country)) {
    throw new Error(`Country must be one of: ${validCountries.join(', ')}`);
  }

  const validLanguages = ['en', 'en-GB', 'en-CA'];
  if (input.language !== undefined && !validLanguages.includes(input.language)) {
    throw new Error(`Language must be one of: ${validLanguages.join(', ')}`);
  }

  const validCurrencies = ['USD', 'GBP', 'CAD'];
  if (input.currency !== undefined && !validCurrencies.includes(input.currency)) {
    throw new Error(`Currency must be one of: ${validCurrencies.join(', ')}`);
  }
}

/**
 * Onboard a new tenant with sensible default configuration
 * Requirement 9.6: Provision tenant pipeline configuration with sensible defaults
 */
export async function onboardTenant(tenantId: string): Promise<TenantConfigResult> {
  // Check if tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // Create default pipeline config if it doesn't exist
  const config = await prisma.pipelineConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      // Defaults are defined in the Prisma schema
    },
    update: {},
  });

  // Get or create default branding
  const branding = await prisma.tenantBranding.upsert({
    where: { tenantId },
    create: {
      tenantId,
      brandName: tenant.name,
      // Other defaults are defined in the Prisma schema
    },
    update: {},
  });

  return {
    config,
    branding,
    tenant,
  };
}

/**
 * Apply tenant branding to email content
 * Requirement 9.3: Use tenant branding in outreach emails
 */
export function applyBrandingToEmail(
  emailContent: string,
  branding: TenantBranding | null,
  tenant: Tenant
): string {
  if (!branding) {
    return emailContent;
  }

  let branded = emailContent;

  // Replace brand name placeholder
  if (branding.brandName) {
    branded = branded.replace(/\{\{brandName\}\}/g, () => branding.brandName as string);
  }

  // Replace contact email placeholder
  if (branding.contactEmail) {
    branded = branded.replace(/\{\{contactEmail\}\}/g, () => branding.contactEmail as string);
  }

  // Replace contact phone placeholder
  if (branding.contactPhone) {
    branded = branded.replace(/\{\{contactPhone\}\}/g, () => branding.contactPhone as string);
  }

  // Replace website URL placeholder
  if (branding.websiteUrl) {
    branded = branded.replace(/\{\{websiteUrl\}\}/g, () => branding.websiteUrl as string);
  }

  return branded;
}

/**
 * Apply tenant branding to proposal data
 * Requirement 9.4: Apply tenant white-label branding to proposals
 */
export function applyBrandingToProposal(
  proposalData: Record<string, any>,
  branding: TenantBranding | null,
  tenant: Tenant
): Record<string, any> {
  if (!branding) {
    return proposalData;
  }

  return {
    ...proposalData,
    branding: {
      brandName: branding.brandName || tenant.name,
      logoUrl: branding.logoUrl,
      logoDarkUrl: branding.logoDarkUrl,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      contactEmail: branding.contactEmail,
      contactPhone: branding.contactPhone,
      websiteUrl: branding.websiteUrl,
      footerText: branding.footerText,
      showPoweredBy: branding.showPoweredBy,
    },
  };
}

/**
 * Check if tenant has reached spending limit
 * Requirement 9.5: Enforce spending limits per billing cycle
 */
export async function checkSpendingLimit(tenantId: string): Promise<{
  limitReached: boolean;
  currentSpendCents: number;
  limitCents: number;
}> {
  const config = await getPipelineConfig(tenantId);

  if (!config) {
    throw new Error(`Pipeline config not found for tenant ${tenantId}`);
  }

  // Get current billing cycle start (first day of current month)
  const billingCycleStart = new Date();
  billingCycleStart.setDate(1);
  billingCycleStart.setHours(0, 0, 0, 0);

  // Sum all pipeline error logs with cost data for this tenant in current cycle
  // Note: In a real implementation, you'd track costs in a dedicated table
  // For now, we'll use a placeholder query
  const currentSpendCents = 0; // TODO: Implement actual cost tracking

  return {
    limitReached: currentSpendCents >= config.spendingLimitCents,
    currentSpendCents,
    limitCents: config.spendingLimitCents,
  };
}

/**
 * Pause a pipeline stage for a tenant
 * Requirement 10.6: Allow manual stage pause/resume
 */
export async function pauseStage(tenantId: string, stage: string): Promise<PipelineConfig> {
  const config = await getPipelineConfig(tenantId);

  if (!config) {
    throw new Error(`Pipeline config not found for tenant ${tenantId}`);
  }

  const pausedStages = (config.pausedStages as string[]) || [];

  if (!pausedStages.includes(stage)) {
    pausedStages.push(stage);
  }

  return prisma.pipelineConfig.update({
    where: { tenantId },
    data: { pausedStages },
  });
}

/**
 * Resume a pipeline stage for a tenant
 * Requirement 10.6: Allow manual stage pause/resume
 */
export async function resumeStage(tenantId: string, stage: string): Promise<PipelineConfig> {
  const config = await getPipelineConfig(tenantId);

  if (!config) {
    throw new Error(`Pipeline config not found for tenant ${tenantId}`);
  }

  const pausedStages = ((config.pausedStages as string[]) || []).filter(s => s !== stage);

  return prisma.pipelineConfig.update({
    where: { tenantId },
    data: { pausedStages },
  });
}

/**
 * Check if a stage is paused for a tenant
 * Requirement 10.6: Check stage pause status
 */
export async function isStagePaused(tenantId: string, stage: string): Promise<boolean> {
  const config = await getPipelineConfig(tenantId);

  if (!config) {
    return false;
  }

  const pausedStages = (config.pausedStages as string[]) || [];
  return pausedStages.includes(stage);
}
