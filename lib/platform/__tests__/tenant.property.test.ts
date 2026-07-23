/**
 * Property-based tests for tenant management.
 * Feature: sprint-5-6-integration-pilot
 * Validates: Requirements 7.1, 7.4, 7.5, 7.6, 7.8
 */

import { describe, it, beforeEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { tenantManager, TIER_LIMITS } from '../tenant/tenantManager';
import { tenantBilling } from '../tenant/tenantBilling';
import type { TenantTier, BillingPeriod, BrandableContent } from '../types';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const tierArb = fc.constantFrom<TenantTier>('starter', 'growth', 'enterprise');

const hexColorArb = fc
  .stringMatching(/^[0-9a-f]{6}$/)
  .map((h) => `#${h}`);

// Safe company name: alphanumeric + spaces only, to avoid regex special chars
const safeNameArb = fc
  .stringMatching(/^[A-Za-z0-9 ]{3,30}$/)
  .filter((s) => s.trim().length >= 3);

const brandingArb = fc.record({
  logo: fc.webUrl(),
  primaryColor: hexColorArb,
  secondaryColor: hexColorArb,
  companyName: safeNameArb,
  contactEmail: fc.emailAddress().filter((e) => !e.includes('$') && !e.includes('`')),
  supportEmail: fc.emailAddress().filter((e) => !e.includes('$') && !e.includes('`')),
});

const tenantConfigArb = fc.record({
  name: safeNameArb,
  tier: tierArb,
  branding: brandingArb,
});

const billingPeriodArb: fc.Arbitrary<BillingPeriod> = fc
  .integer({ min: 0, max: 730 }) // days offset from 2024-01-01
  .map((offset) => {
    const start = new Date('2024-01-01');
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  });

const positiveAmountArb = fc.integer({ min: 100, max: 1_000_000 }); // cents

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  tenantManager._reset();
  tenantBilling._reset();
});

// ── Property 1: Tenant Data Isolation ────────────────────────────────────────
// For any query scoped to a tenant ID, results must contain zero records from
// a different tenant.
// Validates: Requirements 7.1, 7.8

describe('Property 1: Tenant Data Isolation', () => {
  it(
    'Feature: sprint-5-6-integration-pilot, Property 1: Tenant Data Isolation — getTenant returns only the requested tenant',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantConfigArb,
          tenantConfigArb,
          async (configA, configB) => {
            tenantManager._reset();

            const tenantA = await tenantManager.createTenant(configA);
            const tenantB = await tenantManager.createTenant(configB);

            // Querying tenant A must not return tenant B's data
            const fetchedA = await tenantManager.getTenant(tenantA.id);
            expect(fetchedA.id).toBe(tenantA.id);
            expect(fetchedA.id).not.toBe(tenantB.id);
            expect(fetchedA.name).toBe(tenantA.name);

            // Querying tenant B must not return tenant A's data
            const fetchedB = await tenantManager.getTenant(tenantB.id);
            expect(fetchedB.id).toBe(tenantB.id);
            expect(fetchedB.id).not.toBe(tenantA.id);
            expect(fetchedB.name).toBe(tenantB.name);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: sprint-5-6-integration-pilot, Property 1: Tenant Data Isolation — usage metrics are scoped to tenant',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantConfigArb,
          tenantConfigArb,
          billingPeriodArb,
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 50 }),
          async (configA, configB, period, countA, countB) => {
            tenantManager._reset();

            const tenantA = await tenantManager.createTenant(configA);
            const tenantB = await tenantManager.createTenant(configB);

            // Record different usage for each tenant
            tenantManager.recordUsage(tenantA.id, {
              period,
              prospectsDiscovered: countA,
              auditsCompleted: 0,
              proposalsGenerated: 0,
              emailsSent: 0,
              dealsWon: 0,
              apiRequestsUsed: 0,
              costCents: 0,
            });
            tenantManager.recordUsage(tenantB.id, {
              period,
              prospectsDiscovered: countB,
              auditsCompleted: 0,
              proposalsGenerated: 0,
              emailsSent: 0,
              dealsWon: 0,
              apiRequestsUsed: 0,
              costCents: 0,
            });

            const usageA = await tenantManager.getUsageMetrics(tenantA.id, period);
            const usageB = await tenantManager.getUsageMetrics(tenantB.id, period);

            // Each tenant's usage must reflect only their own data
            expect(usageA.tenantId).toBe(tenantA.id);
            expect(usageA.prospectsDiscovered).toBe(countA);

            expect(usageB.tenantId).toBe(tenantB.id);
            expect(usageB.prospectsDiscovered).toBe(countB);

            // Tenant A's usage must not bleed into tenant B's
            expect(usageA.prospectsDiscovered).not.toBe(countA + countB);
            expect(usageB.prospectsDiscovered).not.toBe(countA + countB);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 20: Revenue Share Calculation ───────────────────────────────────
// For any billing period, revenue share = sum(client revenue) × revenueSharePercent,
// auditable with line items.
// Validates: Requirements 7.5, 7.6

describe('Property 20: Revenue Share Calculation', () => {
  it(
    'Feature: sprint-5-6-integration-pilot, Property 20: Revenue Share Calculation — platform share equals gross × sharePercent',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantConfigArb,
          billingPeriodArb,
          fc.array(
            fc.record({
              clientId: fc.uuid(),
              revenueCents: positiveAmountArb,
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (config, period, clientRevenues) => {
            tenantManager._reset();
            tenantBilling._reset();

            const tenant = await tenantManager.createTenant(config);

            // Record client revenues
            for (const { clientId, revenueCents } of clientRevenues) {
              tenantBilling.recordClientRevenue(
                tenant.id,
                period,
                clientId,
                revenueCents,
                `Revenue from client ${clientId}`,
              );
            }

            const calc = await tenantBilling.calculateRevenueShare(tenant.id, period);

            const expectedGross = clientRevenues.reduce((s, r) => s + r.revenueCents, 0);
            const expectedPlatformShare = Math.round(
              expectedGross * (calc.sharePercent / 100),
            );

            // Gross revenue must equal sum of client revenues
            expect(calc.grossRevenue).toBe(expectedGross);

            // Platform share must equal gross × sharePercent
            expect(calc.platformShare).toBe(expectedPlatformShare);

            // Agency share must be the remainder
            expect(calc.agencyShare).toBe(calc.grossRevenue - calc.platformShare);

            // Share percent must be in the 20-30% range
            expect(calc.sharePercent).toBeGreaterThanOrEqual(20);
            expect(calc.sharePercent).toBeLessThanOrEqual(30);

            // Gross = platform + agency (no money lost)
            expect(calc.platformShare + calc.agencyShare).toBe(calc.grossRevenue);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: sprint-5-6-integration-pilot, Property 20: Revenue Share Calculation — invoice has auditable line items',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantConfigArb,
          billingPeriodArb,
          fc.array(
            fc.record({
              clientId: fc.uuid(),
              revenueCents: positiveAmountArb,
            }),
            { minLength: 1, maxLength: 5 },
          ),
          async (config, period, clientRevenues) => {
            tenantManager._reset();
            tenantBilling._reset();

            const tenant = await tenantManager.createTenant(config);

            for (const { clientId, revenueCents } of clientRevenues) {
              tenantBilling.recordClientRevenue(
                tenant.id,
                period,
                clientId,
                revenueCents,
                `Client ${clientId} revenue`,
              );
            }

            const invoice = await tenantBilling.generateInvoice(tenant.id, period);

            // Invoice must have line items (at least one per client + subscription fee)
            expect(invoice.lineItems.length).toBeGreaterThanOrEqual(clientRevenues.length + 1);

            // Each line item must have a description and non-negative amount
            for (const li of invoice.lineItems) {
              expect(li.description.length).toBeGreaterThan(0);
              expect(li.amountCents).toBeGreaterThanOrEqual(0);
            }

            // Total must equal sum of line items
            const lineItemTotal = invoice.lineItems.reduce((s, li) => s + li.amountCents, 0);
            expect(invoice.totalCents).toBe(lineItemTotal);

            // Invoice must be scoped to the correct tenant
            expect(invoice.tenantId).toBe(tenant.id);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 21: Tenant Branding Application ─────────────────────────────────
// For any client-facing output with tenant branding configured, output must
// contain tenant brand name/logo/email, not platform defaults.
// Validates: Requirements 7.4

describe('Property 21: Tenant Branding Application', () => {
  it(
    'Feature: sprint-5-6-integration-pilot, Property 21: Tenant Branding Application — output contains tenant brand, not platform defaults',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantConfigArb,
          fc.constantFrom<BrandableContent['type']>('proposal', 'email', 'report', 'widget'),
          async (config, contentType) => {
            tenantManager._reset();

            // Ensure branding differs from platform defaults
            const branding = {
              ...config.branding,
              companyName: `Agency_${config.branding.companyName}`,
              logo: `https://agency.example.com/logo.png`,
              contactEmail: `contact@agency-${Date.now()}.com`,
              supportEmail: `support@agency-${Date.now()}.com`,
            };

            const tenant = await tenantManager.createTenant({ ...config, branding });

            // Content that uses platform defaults (as would come from templates)
            const platformContent: BrandableContent = {
              type: contentType,
              content: `Welcome to Proposal Engine. Contact us at hello@proposalengine.io. Logo: https://platform.proposalengine.io/logo.png`,
            };

            const branded = await tenantManager.applyBranding(tenant.id, platformContent);

            // Must contain tenant's brand name
            expect(branded.content).toContain(branding.companyName);

            // Must contain tenant's logo
            expect(branded.content).toContain(branding.logo);

            // Must contain tenant's contact email
            expect(branded.content).toContain(branding.contactEmail);

            // Must NOT contain platform defaults
            expect(branded.content).not.toContain('Proposal Engine');
            expect(branded.content).not.toContain('hello@proposalengine.io');
            expect(branded.content).not.toContain('https://platform.proposalengine.io/logo.png');

            // appliedBranding flags must be set
            expect(branded.appliedBranding.companyName).toBe(true);
            expect(branded.appliedBranding.logo).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: sprint-5-6-integration-pilot, Property 21: Tenant Branding Application — template placeholders are replaced',
    async () => {
      await fc.assert(
        fc.asyncProperty(brandingArb, async (branding) => {
          tenantManager._reset();

          const tenant = await tenantManager.createTenant({ branding });

          const templateContent: BrandableContent = {
            type: 'email',
            content: `Hello from {{companyName}}. Visit {{logo}}. Email: {{contactEmail}}`,
          };

          const branded = await tenantManager.applyBranding(tenant.id, templateContent);

          expect(branded.content).toContain(branding.companyName);
          expect(branded.content).toContain(branding.logo);
          expect(branded.content).toContain(branding.contactEmail);
          expect(branded.content).not.toContain('{{companyName}}');
          expect(branded.content).not.toContain('{{logo}}');
          expect(branded.content).not.toContain('{{contactEmail}}');
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 22: Platform Tier Limits ────────────────────────────────────────
// For any tenant, daily prospect count must not exceed the tier's configured limit.
// Validates: Requirements 7.5, 7.8

describe('Property 22: Platform Tier Limits', () => {
  it(
    'Feature: sprint-5-6-integration-pilot, Property 22: Platform Tier Limits — processing pauses when daily limit is reached',
    async () => {
      await fc.assert(
        fc.asyncProperty(tierArb, async (tier) => {
          tenantManager._reset();

          const tenant = await tenantManager.createTenant({ tier });
          const limit = TIER_LIMITS[tier].prospectsPerDay;

          // Process exactly up to the limit
          for (let i = 0; i < limit; i++) {
            const canProcess = await tenantManager.canProcessProspect(tenant.id);
            expect(canProcess).toBe(true);
            await tenantManager.recordProspectProcessed(tenant.id);
          }

          // At the limit, canProcessProspect must return false
          const canProcessAtLimit = await tenantManager.canProcessProspect(tenant.id);
          expect(canProcessAtLimit).toBe(false);

          // Attempting to record one more must throw
          await expect(
            tenantManager.recordProspectProcessed(tenant.id),
          ).rejects.toThrow();

          // Daily count must equal the limit
          const count = tenantManager.getDailyProspectCount(tenant.id);
          expect(count).toBe(limit);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: sprint-5-6-integration-pilot, Property 22: Platform Tier Limits — tier limits match configured values',
    async () => {
      await fc.assert(
        fc.asyncProperty(tierArb, async (tier) => {
          tenantManager._reset();

          const tenant = await tenantManager.createTenant({ tier });

          expect(tenant.limits.prospectsPerDay).toBe(TIER_LIMITS[tier].prospectsPerDay);
          expect(tenant.limits.activeClients).toBe(TIER_LIMITS[tier].activeClients);
          expect(tenant.limits.apiRequestsPerHour).toBe(TIER_LIMITS[tier].apiRequestsPerHour);
        }),
        { numRuns: 100 },
      );
    },
  );
});
