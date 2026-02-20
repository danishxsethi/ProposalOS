import { cleanupDb } from '@/lib/__tests__/utils/cleanup';
/**
 * Unit Tests for Tenant Configuration
 * 
 * Tests default configuration generation, configuration validation,
 * and branding application.
 * 
 * Requirements: 9.2, 9.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import {
  getPipelineConfig,
  upsertPipelineConfig,
  onboardTenant,
  applyBrandingToEmail,
  applyBrandingToProposal,
  checkSpendingLimit,
  pauseStage,
  resumeStage,
  isStagePaused,
} from '../tenantConfig';
import type { Tenant, TenantBranding } from '@prisma/client';

describe('Tenant Configuration', () => {
  const testTenantId = 'test-tenant-config-id';

  beforeEach(async () => {
    // Clean up test data
    await cleanupDb(prisma);
});

  afterEach(async () => {
    // Clean up test data
    await cleanupDb(prisma);
});

  describe('Default Configuration Generation', () => {
    it('should create default configuration for new tenant', async () => {
      // Check if test tenant exists
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        // Skip test if tenant doesn't exist
        return;
      }

      const result = await onboardTenant(testTenantId);

      expect(result.config).toBeDefined();
      expect(result.config.tenantId).toBe(testTenantId);
      expect(result.config.concurrencyLimit).toBe(10); // Default
      expect(result.config.batchSize).toBe(50); // Default
      expect(result.config.painScoreThreshold).toBe(60); // Default
      expect(result.config.dailyVolumeLimit).toBe(200); // Default
      expect(result.config.spendingLimitCents).toBe(100000); // Default $1000
      expect(result.config.hotLeadPercentile).toBe(95); // Default
      expect(result.config.emailMinQualityScore).toBe(90); // Default
      expect(result.config.maxEmailsPerDomainPerDay).toBe(50); // Default

      expect(result.branding).toBeDefined();
      expect(result.branding?.tenantId).toBe(testTenantId);
    });

    it('should not overwrite existing configuration on re-onboarding', async () => {
      // Check if test tenant exists
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        return;
      }

      // First onboarding
      await onboardTenant(testTenantId);

      // Update config
      await upsertPipelineConfig(testTenantId, {
        concurrencyLimit: 25,
        painScoreThreshold: 70,
      });

      // Re-onboard
      const result = await onboardTenant(testTenantId);

      // Should preserve custom values
      expect(result.config.concurrencyLimit).toBe(25);
      expect(result.config.painScoreThreshold).toBe(70);
    });
  });

  describe('Configuration Validation', () => {
    it('should reject invalid concurrency limit', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { concurrencyLimit: 0 })
      ).rejects.toThrow('Concurrency limit must be between 1 and 100');

      await expect(
        upsertPipelineConfig(testTenantId, { concurrencyLimit: 101 })
      ).rejects.toThrow('Concurrency limit must be between 1 and 100');
    });

    it('should reject invalid pain score threshold', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { painScoreThreshold: -1 })
      ).rejects.toThrow('Pain score threshold must be between 0 and 100');

      await expect(
        upsertPipelineConfig(testTenantId, { painScoreThreshold: 101 })
      ).rejects.toThrow('Pain score threshold must be between 0 and 100');
    });

    it('should reject invalid pricing multiplier', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { pricingMultiplier: 0.05 })
      ).rejects.toThrow('Pricing multiplier must be between 0.1 and 10');

      await expect(
        upsertPipelineConfig(testTenantId, { pricingMultiplier: 15 })
      ).rejects.toThrow('Pricing multiplier must be between 0.1 and 10');
    });

    it('should reject invalid country', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { country: 'XX' })
      ).rejects.toThrow('Country must be one of: US, UK, CA');
    });

    it('should reject invalid currency', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { currency: 'EUR' })
      ).rejects.toThrow('Currency must be one of: USD, GBP, CAD');
    });

    it('should reject negative spending limit', async () => {
      await expect(
        upsertPipelineConfig(testTenantId, { spendingLimitCents: -100 })
      ).rejects.toThrow('Spending limit must be non-negative');
    });

    it('should accept valid configuration', async () => {
      // Check if test tenant exists
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        return;
      }

      const config = await upsertPipelineConfig(testTenantId, {
        concurrencyLimit: 20,
        batchSize: 100,
        painScoreThreshold: 75,
        dailyVolumeLimit: 500,
        spendingLimitCents: 200000,
        hotLeadPercentile: 90,
        emailMinQualityScore: 95,
        maxEmailsPerDomainPerDay: 75,
        followUpSchedule: [2, 5, 10],
        pausedStages: ['discovery'],
        country: 'UK',
        language: 'en-GB',
        currency: 'GBP',
        pricingMultiplier: 1.5,
      });

      expect(config.concurrencyLimit).toBe(20);
      expect(config.batchSize).toBe(100);
      expect(config.painScoreThreshold).toBe(75);
      expect(config.dailyVolumeLimit).toBe(500);
      expect(config.spendingLimitCents).toBe(200000);
      expect(config.hotLeadPercentile).toBe(90);
      expect(config.emailMinQualityScore).toBe(95);
      expect(config.maxEmailsPerDomainPerDay).toBe(75);
      expect(config.followUpSchedule).toEqual([2, 5, 10]);
      expect(config.pausedStages).toEqual(['discovery']);
      expect(config.country).toBe('UK');
      expect(config.language).toBe('en-GB');
      expect(config.currency).toBe('GBP');
      expect(config.pricingMultiplier).toBe(1.5);
    });
  });

  describe('Branding Application', () => {
    const mockTenant: Tenant = {
      id: testTenantId,
      name: 'Test Agency',
      slug: 'test-agency',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Tenant;

    const mockBranding: TenantBranding = {
      id: 'branding-id',
      tenantId: testTenantId,
      brandName: 'Acme Digital',
      contactEmail: 'hello@acmedigital.com',
      contactPhone: '+1-555-0123',
      websiteUrl: 'https://acmedigital.com',
      tagline: null,
      logoUrl: null,
      logoDarkUrl: null,
      primaryColor: '#8B5CF6',
      secondaryColor: '#38BDF8',
      accentColor: '#F59E0B',
      customDomain: null,
      customDomainVerified: false,
      customDomainVerifiedAt: null,
      footerText: null,
      showPoweredBy: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should apply branding to email with all placeholders', () => {
      const template = `
        Hi there!
        
        This is {{brandName}} reaching out.
        You can reach us at {{contactEmail}} or call {{contactPhone}}.
        Learn more at {{websiteUrl}}.
        
        Best regards,
        The {{brandName}} Team
      `;

      const result = applyBrandingToEmail(template, mockBranding, mockTenant);

      expect(result).toContain('Acme Digital');
      expect(result).toContain('hello@acmedigital.com');
      expect(result).toContain('+1-555-0123');
      expect(result).toContain('https://acmedigital.com');
      expect(result).not.toContain('{{brandName}}');
      expect(result).not.toContain('{{contactEmail}}');
      expect(result).not.toContain('{{contactPhone}}');
      expect(result).not.toContain('{{websiteUrl}}');
    });

    it('should handle email with no placeholders', () => {
      const template = 'Hello, this is a plain email.';
      const result = applyBrandingToEmail(template, mockBranding, mockTenant);
      expect(result).toBe(template);
    });

    it('should handle null branding gracefully', () => {
      const template = 'Email with {{brandName}} placeholder';
      const result = applyBrandingToEmail(template, null, mockTenant);
      expect(result).toBe(template);
    });

    it('should apply branding to proposal', () => {
      const proposalData = {
        title: 'Website Audit Proposal',
        content: 'Proposal content here',
      };

      const result = applyBrandingToProposal(proposalData, mockBranding, mockTenant);

      expect(result.branding).toBeDefined();
      expect(result.branding.brandName).toBe('Acme Digital');
      expect(result.branding.contactEmail).toBe('hello@acmedigital.com');
      expect(result.branding.contactPhone).toBe('+1-555-0123');
      expect(result.branding.websiteUrl).toBe('https://acmedigital.com');
      expect(result.branding.primaryColor).toBe('#8B5CF6');
      expect(result.title).toBe('Website Audit Proposal');
      expect(result.content).toBe('Proposal content here');
    });

    it('should handle null branding in proposal', () => {
      const proposalData = {
        title: 'Website Audit Proposal',
        content: 'Proposal content here',
      };

      const result = applyBrandingToProposal(proposalData, null, mockTenant);
      expect(result).toEqual(proposalData);
    });
  });

  describe('Stage Pause/Resume', () => {
    it('should pause and resume stages', async () => {
      // Check if test tenant exists
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        return;
      }

      // Create config
      await onboardTenant(testTenantId);

      // Initially not paused
      expect(await isStagePaused(testTenantId, 'discovery')).toBe(false);

      // Pause stage
      await pauseStage(testTenantId, 'discovery');
      expect(await isStagePaused(testTenantId, 'discovery')).toBe(true);

      // Resume stage
      await resumeStage(testTenantId, 'discovery');
      expect(await isStagePaused(testTenantId, 'discovery')).toBe(false);
    });

    it('should handle pausing already paused stage', async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        return;
      }

      await onboardTenant(testTenantId);

      await pauseStage(testTenantId, 'discovery');
      await pauseStage(testTenantId, 'discovery'); // Pause again

      const config = await getPipelineConfig(testTenantId);
      const pausedStages = config?.pausedStages as string[];
      
      // Should only appear once
      expect(pausedStages.filter(s => s === 'discovery').length).toBe(1);
    });

    it('should handle multiple paused stages', async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: testTenantId },
      });

      if (!tenant) {
        return;
      }

      await onboardTenant(testTenantId);

      await pauseStage(testTenantId, 'discovery');
      await pauseStage(testTenantId, 'audit');
      await pauseStage(testTenantId, 'outreach');

      expect(await isStagePaused(testTenantId, 'discovery')).toBe(true);
      expect(await isStagePaused(testTenantId, 'audit')).toBe(true);
      expect(await isStagePaused(testTenantId, 'outreach')).toBe(true);
      expect(await isStagePaused(testTenantId, 'proposal')).toBe(false);

      // Resume one
      await resumeStage(testTenantId, 'audit');

      expect(await isStagePaused(testTenantId, 'discovery')).toBe(true);
      expect(await isStagePaused(testTenantId, 'audit')).toBe(false);
      expect(await isStagePaused(testTenantId, 'outreach')).toBe(true);
    });
  });
});
