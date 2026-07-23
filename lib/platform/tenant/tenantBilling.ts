/**
 * Tenant Billing — White-Label Platform
 * Revenue share calculation, invoice generation, payment processing (Stripe stub),
 * and tier upgrades.
 * Requirements: 7.5, 7.6
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BillingPeriod,
  RevenueShareCalculation,
  Invoice,
  PaymentResult,
  SubscriptionStatus,
  TenantTier,
} from '../types';
import { tenantManager, TIER_LIMITS } from './tenantManager';

// ── In-memory stores ─────────────────────────────────────────────────────────

// invoiceId → Invoice
const invoiceStore = new Map<string, Invoice>();

// tenantId → client revenue records for a period
// Each entry: { periodKey: string; clientId: string; revenueCents: number }
interface ClientRevenueRecord {
  periodKey: string;
  clientId: string;
  revenueCents: number;
  description: string;
}
const clientRevenueStore = new Map<string, ClientRevenueRecord[]>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function periodKey(period: BillingPeriod): string {
  return `${period.start.toISOString().slice(0, 10)}__${period.end.toISOString().slice(0, 10)}`;
}

// ── TenantBilling implementation ─────────────────────────────────────────────

export const tenantBilling = {
  /**
   * Calculate revenue share for a tenant over a billing period.
   * Platform keeps revenueSharePercent (20-30%), agency keeps the rest.
   * Requirement 7.6: revenue share with auditable line items.
   */
  async calculateRevenueShare(
    tenantId: string,
    period: BillingPeriod,
  ): Promise<RevenueShareCalculation> {
    const tenant = await tenantManager.getTenant(tenantId);
    const pKey = periodKey(period);
    const records = (clientRevenueStore.get(tenantId) ?? []).filter(
      (r) => r.periodKey === pKey,
    );

    const grossRevenue = records.reduce((sum, r) => sum + r.revenueCents, 0);
    const sharePercent = tenant.billing.revenueSharePercent; // 20-30
    const platformShare = Math.round(grossRevenue * (sharePercent / 100));
    const agencyShare = grossRevenue - platformShare;

    return {
      tenantId,
      period,
      grossRevenue,
      platformShare,
      agencyShare,
      sharePercent,
    };
  },

  /**
   * Generate an invoice with line-item detail for a billing period.
   * Requirement 7.7: per-tenant billing and invoicing.
   */
  async generateInvoice(tenantId: string, period: BillingPeriod): Promise<Invoice> {
    const tenant = await tenantManager.getTenant(tenantId);
    const pKey = periodKey(period);
    const records = (clientRevenueStore.get(tenantId) ?? []).filter(
      (r) => r.periodKey === pKey,
    );

    const sharePercent = tenant.billing.revenueSharePercent;

    // Build line items: one per client revenue record (platform's cut)
    const lineItems = records.map((r) => ({
      description: r.description,
      amountCents: Math.round(r.revenueCents * (sharePercent / 100)),
    }));

    // Add platform subscription fee line item (flat fee by tier)
    const tierFees: Record<TenantTier, number> = {
      starter: 29900,   // $299/mo
      growth: 79900,    // $799/mo
      enterprise: 199900, // $1999/mo
    };
    lineItems.push({
      description: `Platform subscription — ${tenant.tier} tier`,
      amountCents: tierFees[tenant.tier],
    });

    const totalCents = lineItems.reduce((s, li) => s + li.amountCents, 0);

    const dueAt = new Date(period.end);
    dueAt.setDate(dueAt.getDate() + 30); // net-30

    const invoice: Invoice = {
      id: uuidv4(),
      tenantId,
      period,
      lineItems,
      totalCents,
      status: 'draft',
      dueAt,
      createdAt: new Date(),
    };

    invoiceStore.set(invoice.id, invoice);
    return invoice;
  },

  /**
   * Process payment for an invoice (Stripe stub).
   * Requirement 7.5: tiered platform pricing.
   */
  async processPayment(invoiceId: string): Promise<PaymentResult> {
    const invoice = invoiceStore.get(invoiceId);
    if (!invoice) {
      return { success: false, errorMessage: `Invoice not found: ${invoiceId}` };
    }

    if (invoice.status === 'paid') {
      return { success: false, errorMessage: 'Invoice already paid' };
    }

    // Stub: in production this calls Stripe API
    const transactionId = `txn_${uuidv4().replace(/-/g, '').slice(0, 24)}`;

    // Update invoice status
    const updated: Invoice = { ...invoice, status: 'paid' };
    invoiceStore.set(invoiceId, updated);

    return { success: true, transactionId };
  },

  /**
   * Get subscription status for a tenant.
   */
  async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
    const tenant = await tenantManager.getTenant(tenantId);

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    return {
      tenantId,
      tier: tenant.tier,
      status: tenant.status === 'active' ? 'active' : 'cancelled',
      currentPeriodEnd,
      cancelAtPeriodEnd: tenant.status === 'cancelled',
    };
  },

  /**
   * Upgrade (or downgrade) a tenant's tier.
   * Updates limits and billing share percent accordingly.
   */
  async upgradeTier(tenantId: string, newTier: TenantTier): Promise<void> {
    const tenant = await tenantManager.getTenant(tenantId);

    const shareByTier: Record<TenantTier, number> = {
      starter: 20,
      growth: 25,
      enterprise: 30,
    };

    await tenantManager.updateTenant(tenantId, {
      tier: newTier,
      limits: { ...TIER_LIMITS[newTier] },
      billing: {
        ...tenant.billing,
        revenueSharePercent: shareByTier[newTier],
      },
    });
  },

  // ── Internal helpers for tests ────────────────────────────────────────────

  /** Record client revenue for a period (used by pipeline to feed billing). */
  recordClientRevenue(
    tenantId: string,
    period: BillingPeriod,
    clientId: string,
    revenueCents: number,
    description: string,
  ): void {
    const records = clientRevenueStore.get(tenantId) ?? [];
    records.push({ periodKey: periodKey(period), clientId, revenueCents, description });
    clientRevenueStore.set(tenantId, records);
  },

  /** Get invoice by ID. */
  getInvoice(invoiceId: string): Invoice | undefined {
    return invoiceStore.get(invoiceId);
  },

  /** Clear all in-memory state (for tests). */
  _reset(): void {
    invoiceStore.clear();
    clientRevenueStore.clear();
  },
};
