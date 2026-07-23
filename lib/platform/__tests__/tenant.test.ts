/**
 * Unit tests for tenant management.
 * Requirements: 7.2, 7.4, 7.5, 7.6
 */

import { describe, it, beforeEach, expect } from 'vitest';
import { tenantManager, TIER_LIMITS } from '../tenant/tenantManager';
import { tenantBilling } from '../tenant/tenantBilling';
import { domainManager } from '../tenant/domainManager';
import type { BillingPeriod, BrandableContent } from '../types';

beforeEach(() => {
  tenantManager._reset();
  tenantBilling._reset();
  domainManager._reset();
});

// ── Tenant creation with defaults ─────────────────────────────────────────────

describe('createTenant', () => {
  it('creates a tenant with starter tier defaults when no tier specified', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Test Agency' });

    expect(tenant.tier).toBe('starter');
    expect(tenant.limits).toEqual(TIER_LIMITS.starter);
    expect(tenant.status).toBe('active');
    expect(tenant.id).toBeTruthy();
    expect(tenant.slug).toBe('test-agency');
  });

  it('creates a tenant with growth tier defaults', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Growth Agency', tier: 'growth' });

    expect(tenant.tier).toBe('growth');
    expect(tenant.limits.prospectsPerDay).toBe(500);
    expect(tenant.limits.activeClients).toBe(50);
    expect(tenant.limits.apiRequestsPerHour).toBe(5000);
  });

  it('creates a tenant with enterprise tier defaults', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Big Agency', tier: 'enterprise' });

    expect(tenant.limits.prospectsPerDay).toBe(2000);
    expect(tenant.limits.activeClients).toBe(200);
    expect(tenant.limits.apiRequestsPerHour).toBe(20000);
  });

  it('assigns default branding from platform defaults when none provided', async () => {
    const tenant = await tenantManager.createTenant({ name: 'No Brand Agency' });

    expect(tenant.branding.companyName).toBe('Proposal Engine');
    expect(tenant.branding.contactEmail).toBe('hello@proposalengine.io');
  });

  it('uses provided branding when specified', async () => {
    const branding = {
      logo: 'https://myagency.com/logo.png',
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
      companyName: 'My Agency',
      contactEmail: 'hi@myagency.com',
      supportEmail: 'support@myagency.com',
    };
    const tenant = await tenantManager.createTenant({ name: 'My Agency', branding });

    expect(tenant.branding).toEqual(branding);
  });

  it('generates a unique ID for each tenant', async () => {
    const t1 = await tenantManager.createTenant({ name: 'Agency One' });
    const t2 = await tenantManager.createTenant({ name: 'Agency Two' });

    expect(t1.id).not.toBe(t2.id);
  });

  it('sets revenue share percent based on tier', async () => {
    const starter = await tenantManager.createTenant({ tier: 'starter' });
    const growth = await tenantManager.createTenant({ tier: 'growth' });
    const enterprise = await tenantManager.createTenant({ tier: 'enterprise' });

    expect(starter.billing.revenueSharePercent).toBe(20);
    expect(growth.billing.revenueSharePercent).toBe(25);
    expect(enterprise.billing.revenueSharePercent).toBe(30);
  });
});

// ── getTenant / updateTenant / suspendTenant ──────────────────────────────────

describe('getTenant', () => {
  it('retrieves a tenant by ID', async () => {
    const created = await tenantManager.createTenant({ name: 'Fetch Me' });
    const fetched = await tenantManager.getTenant(created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('Fetch Me');
  });

  it('throws when tenant does not exist', async () => {
    await expect(tenantManager.getTenant('nonexistent-id')).rejects.toThrow('Tenant not found');
  });
});

describe('updateTenant', () => {
  it('updates tenant fields', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Old Name' });
    const updated = await tenantManager.updateTenant(tenant.id, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
    expect(updated.id).toBe(tenant.id); // ID unchanged
  });

  it('does not change immutable fields', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Agency' });
    const updated = await tenantManager.updateTenant(tenant.id, {
      id: 'hacked-id',
      createdAt: new Date('2000-01-01'),
    } as any);

    expect(updated.id).toBe(tenant.id);
    expect(updated.createdAt.getTime()).toBe(tenant.createdAt.getTime());
  });
});

describe('suspendTenant', () => {
  it('sets tenant status to suspended', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Bad Actor' });
    await tenantManager.suspendTenant(tenant.id, 'Terms of service violation');

    const fetched = await tenantManager.getTenant(tenant.id);
    expect(fetched.status).toBe('suspended');
  });
});

// ── Branding application ──────────────────────────────────────────────────────

describe('applyBranding', () => {
  const agencyBranding = {
    logo: 'https://myagency.com/logo.png',
    primaryColor: '#123456',
    secondaryColor: '#654321',
    companyName: 'My Agency',
    contactEmail: 'hi@myagency.com',
    supportEmail: 'support@myagency.com',
  };

  it('replaces platform defaults with tenant branding', async () => {
    const tenant = await tenantManager.createTenant({ branding: agencyBranding });

    const content: BrandableContent = {
      type: 'proposal',
      content: 'Welcome to Proposal Engine. Contact hello@proposalengine.io.',
    };

    const branded = await tenantManager.applyBranding(tenant.id, content);

    expect(branded.content).toContain('My Agency');
    expect(branded.content).toContain('hi@myagency.com');
    expect(branded.content).not.toContain('Proposal Engine');
    expect(branded.content).not.toContain('hello@proposalengine.io');
  });

  it('replaces template placeholders', async () => {
    const tenant = await tenantManager.createTenant({ branding: agencyBranding });

    const content: BrandableContent = {
      type: 'email',
      content: 'Hello from {{companyName}}. Logo: {{logo}}. Email: {{contactEmail}}',
    };

    const branded = await tenantManager.applyBranding(tenant.id, content);

    expect(branded.content).toContain('My Agency');
    expect(branded.content).toContain('https://myagency.com/logo.png');
    expect(branded.content).toContain('hi@myagency.com');
    expect(branded.content).not.toContain('{{companyName}}');
    expect(branded.content).not.toContain('{{logo}}');
    expect(branded.content).not.toContain('{{contactEmail}}');
  });

  it('sets appliedBranding flags correctly', async () => {
    const tenant = await tenantManager.createTenant({ branding: agencyBranding });

    const content: BrandableContent = {
      type: 'report',
      content: '{{companyName}} report. {{logo}}',
    };

    const branded = await tenantManager.applyBranding(tenant.id, content);

    expect(branded.appliedBranding.companyName).toBe(true);
    expect(branded.appliedBranding.logo).toBe(true);
  });
});

// ── Tier limit enforcement ────────────────────────────────────────────────────

describe('tier limit enforcement', () => {
  it('allows processing up to the daily limit', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });
    const limit = TIER_LIMITS.starter.prospectsPerDay; // 100

    for (let i = 0; i < limit; i++) {
      await tenantManager.recordProspectProcessed(tenant.id);
    }

    expect(tenantManager.getDailyProspectCount(tenant.id)).toBe(limit);
  });

  it('throws when daily limit is exceeded', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });
    const limit = TIER_LIMITS.starter.prospectsPerDay;

    for (let i = 0; i < limit; i++) {
      await tenantManager.recordProspectProcessed(tenant.id);
    }

    await expect(tenantManager.recordProspectProcessed(tenant.id)).rejects.toThrow(
      /tier limit reached/i,
    );
  });

  it('canProcessProspect returns false at limit', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });
    const limit = TIER_LIMITS.starter.prospectsPerDay;

    for (let i = 0; i < limit; i++) {
      await tenantManager.recordProspectProcessed(tenant.id);
    }

    const canProcess = await tenantManager.canProcessProspect(tenant.id);
    expect(canProcess).toBe(false);
  });

  it('canProcessProspect returns true when under limit', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'growth' });

    const canProcess = await tenantManager.canProcessProspect(tenant.id);
    expect(canProcess).toBe(true);
  });
});

// ── Revenue share calculations ────────────────────────────────────────────────

describe('calculateRevenueShare', () => {
  const period: BillingPeriod = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31'),
  };

  it('calculates correct revenue share for starter tier (20%)', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });

    tenantBilling.recordClientRevenue(tenant.id, period, 'client-1', 100_000, 'Client 1');
    tenantBilling.recordClientRevenue(tenant.id, period, 'client-2', 50_000, 'Client 2');

    const calc = await tenantBilling.calculateRevenueShare(tenant.id, period);

    expect(calc.grossRevenue).toBe(150_000);
    expect(calc.sharePercent).toBe(20);
    expect(calc.platformShare).toBe(30_000); // 20% of 150k
    expect(calc.agencyShare).toBe(120_000); // 80% of 150k
  });

  it('calculates correct revenue share for enterprise tier (30%)', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'enterprise' });

    tenantBilling.recordClientRevenue(tenant.id, period, 'client-1', 200_000, 'Client 1');

    const calc = await tenantBilling.calculateRevenueShare(tenant.id, period);

    expect(calc.grossRevenue).toBe(200_000);
    expect(calc.sharePercent).toBe(30);
    expect(calc.platformShare).toBe(60_000);
    expect(calc.agencyShare).toBe(140_000);
  });

  it('platform + agency share equals gross revenue', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'growth' });

    tenantBilling.recordClientRevenue(tenant.id, period, 'client-1', 333_333, 'Client 1');

    const calc = await tenantBilling.calculateRevenueShare(tenant.id, period);

    expect(calc.platformShare + calc.agencyShare).toBe(calc.grossRevenue);
  });

  it('returns zero revenue for period with no records', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });

    const calc = await tenantBilling.calculateRevenueShare(tenant.id, period);

    expect(calc.grossRevenue).toBe(0);
    expect(calc.platformShare).toBe(0);
    expect(calc.agencyShare).toBe(0);
  });
});

describe('generateInvoice', () => {
  const period: BillingPeriod = {
    start: new Date('2024-02-01'),
    end: new Date('2024-02-29'),
  };

  it('generates invoice with line items and correct total', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });

    tenantBilling.recordClientRevenue(tenant.id, period, 'c1', 50_000, 'Client A revenue');
    tenantBilling.recordClientRevenue(tenant.id, period, 'c2', 75_000, 'Client B revenue');

    const invoice = await tenantBilling.generateInvoice(tenant.id, period);

    expect(invoice.tenantId).toBe(tenant.id);
    expect(invoice.lineItems.length).toBeGreaterThanOrEqual(3); // 2 clients + subscription
    expect(invoice.totalCents).toBe(
      invoice.lineItems.reduce((s, li) => s + li.amountCents, 0),
    );
    expect(invoice.status).toBe('draft');
  });

  it('includes subscription fee line item', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'growth' });

    const invoice = await tenantBilling.generateInvoice(tenant.id, period);

    const subscriptionLine = invoice.lineItems.find((li) =>
      li.description.toLowerCase().includes('subscription'),
    );
    expect(subscriptionLine).toBeDefined();
    expect(subscriptionLine!.amountCents).toBe(79900); // $799 for growth
  });
});

describe('processPayment', () => {
  const period: BillingPeriod = {
    start: new Date('2024-03-01'),
    end: new Date('2024-03-31'),
  };

  it('processes payment and marks invoice as paid', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });
    const invoice = await tenantBilling.generateInvoice(tenant.id, period);

    const result = await tenantBilling.processPayment(invoice.id);

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeTruthy();

    const updated = tenantBilling.getInvoice(invoice.id);
    expect(updated?.status).toBe('paid');
  });

  it('fails for non-existent invoice', async () => {
    const result = await tenantBilling.processPayment('nonexistent-invoice');

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('not found');
  });

  it('fails for already-paid invoice', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });
    const invoice = await tenantBilling.generateInvoice(tenant.id, period);

    await tenantBilling.processPayment(invoice.id);
    const result = await tenantBilling.processPayment(invoice.id);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('already paid');
  });
});

describe('upgradeTier', () => {
  it('upgrades tier and updates limits', async () => {
    const tenant = await tenantManager.createTenant({ tier: 'starter' });

    await tenantBilling.upgradeTier(tenant.id, 'growth');

    const updated = await tenantManager.getTenant(tenant.id);
    expect(updated.tier).toBe('growth');
    expect(updated.limits.prospectsPerDay).toBe(500);
    expect(updated.billing.revenueSharePercent).toBe(25);
  });
});

// ── Domain manager ────────────────────────────────────────────────────────────

describe('domainManager', () => {
  it('validates a well-formed domain', async () => {
    const result = await domainManager.validateDomain('proposals.myagency.com');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an invalid domain format', async () => {
    const result = await domainManager.validateDomain('not a domain!');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects reserved platform domains', async () => {
    const result = await domainManager.validateDomain('proposalengine.io');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('reserved'))).toBe(true);
  });

  it('provisions a domain for a tenant', async () => {
    const tenant = await tenantManager.createTenant({ name: 'Domain Agency' });

    await domainManager.provisionDomain(tenant.id, 'proposals.myagency.com', 'proposal');

    const status = await domainManager.getDomainStatus('proposals.myagency.com');
    expect(status).not.toBeNull();
    expect(status!.tenantId).toBe(tenant.id);
    expect(status!.type).toBe('proposal');
  });

  it('prevents provisioning the same domain twice', async () => {
    const t1 = await tenantManager.createTenant({ name: 'Agency 1' });
    const t2 = await tenantManager.createTenant({ name: 'Agency 2' });

    await domainManager.provisionDomain(t1.id, 'shared.example.com', 'portal');

    await expect(
      domainManager.provisionDomain(t2.id, 'shared.example.com', 'portal'),
    ).rejects.toThrow();
  });
});
