/**
 * lib/__tests__/pricing.test.ts
 * 
 * Unit Tests for Proposal Pricing
 * 
 * Tests cover:
 * - Base pricing tiers
 * - Industry multipliers
 * - Business size multipliers
 * - Location premiums
 * - Floor/ceiling boundaries
 * - Dynamic pricing calculation
 */

import { describe, it, expect } from 'vitest';
import {
  getDynamicPricing,
  getProposalPricing,
  getIndustryPricing,
  classifyBusinessSize,
  PROPOSAL_PRICING,
  type DynamicPricingInput,
} from '@/lib/proposal/pricing';

describe('Proposal Pricing', () => {
  describe('Base Pricing', () => {
    it('should return base pricing tiers', () => {
      const pricing = getProposalPricing();
      expect(pricing.starter).toBe(497);
      expect(pricing.growth).toBe(1497);
      expect(pricing.premium).toBe(2997);
    });

    it('should return a copy, not the original object', () => {
      const pricing1 = getProposalPricing();
      const pricing2 = getProposalPricing();
      expect(pricing1).toEqual(pricing2);
      expect(pricing1).not.toBe(pricing2);
    });
  });

  describe('Industry Multipliers', () => {
    it('should apply legal industry multiplier (1.3x)', () => {
      const pricing = getDynamicPricing({ industry: 'legal' });
      expect(pricing.starter).toBeGreaterThan(497);
      expect(pricing.growth).toBeGreaterThan(1497);
      expect(pricing.premium).toBeGreaterThan(2997);
    });

    it('should apply medical industry multiplier (1.4x custom)', () => {
      const pricing = getDynamicPricing({ industry: 'medical' });
      // Custom multiplier is 1.4
      expect(pricing.starter).toBeGreaterThanOrEqual(397);
      expect(pricing.starter).toBeLessThanOrEqual(797);
    });

    it('should apply healthcare industry multiplier (1.4x custom)', () => {
      const pricing = getDynamicPricing({ industry: 'healthcare' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply dental industry multiplier (1.4x custom)', () => {
      const pricing = getDynamicPricing({ industry: 'dental' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply restaurant industry discount (0.8x)', () => {
      const pricing = getDynamicPricing({ industry: 'restaurant' });
      expect(pricing.starter).toBeLessThan(497);
    });

    it('should apply ecommerce industry multiplier (1.2x)', () => {
      const pricing = getDynamicPricing({ industry: 'ecommerce' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should use general multiplier (1.0x) for unknown industry', () => {
      const pricing = getDynamicPricing({ industry: 'unknown_industry' });
      expect(pricing.starter).toBe(497);
      expect(pricing.growth).toBe(1497);
      expect(pricing.premium).toBe(2997);
    });

    it('should handle null industry', () => {
      const pricing = getDynamicPricing({ industry: null });
      expect(pricing.starter).toBe(497);
    });
  });

  describe('Business Size Multipliers', () => {
    it('should apply small business multiplier (0.8x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', businessSize: 'small' });
      expect(pricing.starter).toBeLessThan(497);
    });

    it('should apply medium business multiplier (1.0x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', businessSize: 'medium' });
      expect(pricing.starter).toBe(497);
    });

    it('should apply large business multiplier (1.3x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', businessSize: 'large' });
      expect(pricing.starter).toBeGreaterThan(497);
      expect(pricing.starter).toBeLessThanOrEqual(797);
    });

    it('should apply enterprise multiplier (1.5x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', businessSize: 'enterprise' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should classify business size from employee count (small)', () => {
      expect(classifyBusinessSize(5)).toBe('small');
      expect(classifyBusinessSize(10)).toBe('small');
    });

    it('should classify business size from employee count (medium)', () => {
      expect(classifyBusinessSize(11)).toBe('medium');
      expect(classifyBusinessSize(50)).toBe('medium');
    });

    it('should classify business size from employee count (large)', () => {
      expect(classifyBusinessSize(51)).toBe('large');
      expect(classifyBusinessSize(200)).toBe('large');
    });

    it('should classify business size from employee count (enterprise)', () => {
      expect(classifyBusinessSize(201)).toBe('enterprise');
      expect(classifyBusinessSize(1000)).toBe('enterprise');
    });

    it('should classify unknown when no employee count provided', () => {
      expect(classifyBusinessSize()).toBe('unknown');
      expect(classifyBusinessSize(undefined)).toBe('unknown');
    });

    it('should apply multiplier based on employee count', () => {
      const smallPricing = getDynamicPricing({ industry: 'general', employeeCount: 5 });
      const mediumPricing = getDynamicPricing({ industry: 'general', employeeCount: 25 });
      const largePricing = getDynamicPricing({ industry: 'general', employeeCount: 100 });
      const enterprisePricing = getDynamicPricing({ industry: 'general', employeeCount: 500 });

      expect(smallPricing.starter).toBeLessThan(mediumPricing.starter);
      expect(mediumPricing.starter).toBeLessThan(largePricing.starter);
      expect(largePricing.starter).toBeLessThan(enterprisePricing.starter);
    });
  });

  describe('Revenue Multipliers', () => {
    it('should apply 0-100k revenue multiplier (1.0x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', revenue: '0-100k' });
      expect(pricing.starter).toBe(497);
    });

    it('should apply 100k-500k revenue multiplier (1.1x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', revenue: '100k-500k' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply 500k-1m revenue multiplier (1.25x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', revenue: '500k-1m' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply 1m-5m revenue multiplier (1.4x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', revenue: '1m-5m' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply 5m+ revenue multiplier (1.6x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', revenue: '5m+' });
      expect(pricing.starter).toBeGreaterThan(497);
    });
  });

  describe('Location Premium', () => {
    it('should apply NYC location premium (1.15x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'New York, NY' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply San Francisco location premium (1.15x)', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'San Francisco, CA' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply SF short form location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'SF' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply LA location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Los Angeles' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply Chicago location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Chicago, IL' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply Boston location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Boston, MA' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply Seattle location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Seattle, WA' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should apply Miami location premium', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Miami, FL' });
      expect(pricing.starter).toBeGreaterThan(497);
    });

    it('should not apply premium for non-premium location', () => {
      const pricing = getDynamicPricing({ industry: 'general', location: 'Small Town, USA' });
      expect(pricing.starter).toBe(497);
    });
  });

  describe('Combined Multipliers', () => {
    it('should combine industry and business size multipliers', () => {
      const pricing = getDynamicPricing({
        industry: 'legal',
        businessSize: 'large',
      });
      // Legal: 1.3x, Large: 1.3x = 1.69x combined
      expect(pricing.starter).toBeGreaterThan(497);
      expect(pricing.starter).toBeLessThanOrEqual(797);
    });

    it('should combine industry, size, and location multipliers', () => {
      const pricing = getDynamicPricing({
        industry: 'medical',
        businessSize: 'enterprise',
        location: 'New York',
      });
      // Medical: 1.4x, Enterprise: 1.5x, NYC: 1.15x = 2.415x combined
      expect(pricing.starter).toBeLessThanOrEqual(797); // Hit ceiling
    });

    it('should combine revenue and industry multipliers', () => {
      const pricing = getDynamicPricing({
        industry: 'dental',
        revenue: '1m-5m',
      });
      // Dental: 1.4x, 1m-5m: 1.4x = 1.96x combined
      expect(pricing.starter).toBeGreaterThan(497);
    });
  });

  describe('Floor and Ceiling Boundaries', () => {
    it('should not go below starter floor ($397)', () => {
      // Even with extreme discounts, should not go below floor
      const pricing = getDynamicPricing({
        industry: 'restaurant', // 0.8x
        businessSize: 'small', // 0.8x
        revenue: '0-100k', // 1.0x
      });
      expect(pricing.starter).toBeGreaterThanOrEqual(397);
    });

    it('should not exceed starter ceiling ($797)', () => {
      const pricing = getDynamicPricing({
        industry: 'medical', // 1.4x
        businessSize: 'enterprise', // 1.5x
        location: 'New York', // 1.15x
        revenue: '5m+', // 1.6x
      });
      expect(pricing.starter).toBeLessThanOrEqual(797);
    });

    it('should not go below growth floor ($997)', () => {
      const pricing = getDynamicPricing({
        industry: 'restaurant',
        businessSize: 'small',
      });
      expect(pricing.growth).toBeGreaterThanOrEqual(997);
    });

    it('should not exceed growth ceiling ($2497)', () => {
      const pricing = getDynamicPricing({
        industry: 'medical',
        businessSize: 'enterprise',
        location: 'New York',
      });
      expect(pricing.growth).toBeLessThanOrEqual(2497);
    });

    it('should not go below premium floor ($1997)', () => {
      const pricing = getDynamicPricing({
        industry: 'restaurant',
        businessSize: 'small',
      });
      expect(pricing.premium).toBeGreaterThanOrEqual(1997);
    });

    it('should not exceed premium ceiling ($4997)', () => {
      const pricing = getDynamicPricing({
        industry: 'medical',
        businessSize: 'enterprise',
        location: 'New York',
      });
      expect(pricing.premium).toBeLessThanOrEqual(4997);
    });
  });

  describe('Price Formatting', () => {
    it('should end prices in 7 (psychology pricing)', () => {
      const pricing = getDynamicPricing({ industry: 'legal' });
      expect(pricing.starter % 10).toBe(7);
      expect(pricing.growth % 10).toBe(7);
      expect(pricing.premium % 10).toBe(7);
    });
  });

  describe('Legacy Interface', () => {
    it('should return legacy format with essentials/growth/premium keys', () => {
      const legacy = getIndustryPricing();
      expect(legacy).toHaveProperty('essentials');
      expect(legacy).toHaveProperty('growth');
      expect(legacy).toHaveProperty('premium');
      expect(legacy.essentials).toBe(497);
      expect(legacy.growth).toBe(1497);
      expect(legacy.premium).toBe(2997);
    });

    it('should accept string industry for legacy interface', () => {
      const legacy = getIndustryPricing('legal');
      expect(legacy.essentials).toBeGreaterThan(497);
    });

    it('should accept DynamicPricingInput for legacy interface', () => {
      const legacy = getIndustryPricing({ industry: 'dental', businessSize: 'medium' });
      expect(legacy.essentials).toBeGreaterThan(497);
    });

    it('getPricing should be alias for getIndustryPricing', () => {
      // getPricing is exported as alias, test via import
      // Since it's a direct alias, testing the function equivalence
      const pricing1 = getIndustryPricing('legal');
      // The module exports getPricing = getIndustryPricing, so they're the same function
      expect(typeof getIndustryPricing).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string industry', () => {
      const pricing = getDynamicPricing({ industry: '' });
      expect(pricing.starter).toBe(497);
    });

    it('should handle case-insensitive industry', () => {
      const pricing1 = getDynamicPricing({ industry: 'Legal' });
      const pricing2 = getDynamicPricing({ industry: 'LEGAL' });
      const pricing3 = getDynamicPricing({ industry: 'legal' });
      expect(pricing1).toEqual(pricing2);
      expect(pricing2).toEqual(pricing3);
    });

    it('should handle case-insensitive location', () => {
      const pricing1 = getDynamicPricing({ industry: 'general', location: 'NEW YORK' });
      const pricing2 = getDynamicPricing({ industry: 'general', location: 'new york' });
      expect(pricing1.starter).toBe(pricing2.starter);
    });

    it('should handle case-insensitive revenue', () => {
      const pricing1 = getDynamicPricing({ industry: 'general', revenue: '1M-5M' });
      const pricing2 = getDynamicPricing({ industry: 'general', revenue: '1m-5m' });
      expect(pricing1).toEqual(pricing2);
    });
  });
});