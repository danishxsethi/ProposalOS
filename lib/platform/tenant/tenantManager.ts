/**
 * Tenant Manager — White-Label Platform
 * Implements multi-tenant isolation, branding, tier limits, and usage metrics.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 7.8
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  TenantConfig,
  TenantTier,
  TenantStatus,
  TenantUsage,
  BrandableContent,
  BrandedContent,
  DomainValidation,
  TenantLimits,
  TenantBrandingConfig,
} from '../types';
import type { DateRange } from '../../pipeline/types';

// ── Tier defaults ────────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<TenantTier, TenantLimits> = {
  starter: {
    prospectsPerDay: 100,
    activeClients: 10,
    apiRequestsPerHour: 1000,
  },
  growth: {
    prospectsPerDay: 500,
    activeClients: 50,
    apiRequestsPerHour: 5000,
  },
  enterprise: {
    prospectsPerDay: 2000,
    activeClients: 200,
    apiRequestsPerHour: 20000,
  },
};

const PLATFORM_DEFAULTS: TenantBrandingConfig = {
  logo: 'https://platform.proposalengine.io/logo.png',
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  companyName: 'Proposal Engine',
  contactEmail: 'hello@proposalengine.io',
  supportEmail: 'support@proposalengine.io',
};

// ── In-memory store (stub — no real DB) ─────────────────────────────────────

const tenantStore = new Map<string, TenantConfig>();

// Per-tenant daily prospect counters: tenantId → { date: string; count: number }
const dailyProspectCounters = new Map<string, { date: string; count: number }>();

// Per-tenant usage records (accumulated)
const usageStore = new Map<string, TenantUsage[]>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function defaultBilling(tier: TenantTier) {
  // Revenue share: platform keeps 20% for starter, 25% for growth, 30% for enterprise
  const shareByTier: Record<TenantTier, number> = {
    starter: 20,
    growth: 25,
    enterprise: 30,
  };
  return {
    stripeCustomerId: '',
    subscriptionId: '',
    revenueSharePercent: shareByTier[tier],
  };
}

// ── TenantManager implementation ─────────────────────────────────────────────

export const tenantManager = {
  /**
   * Create a new tenant with sensible defaults for all tier settings.
   * Requirement 7.2: self-serve onboarding within 24 hours.
   */
  async createTenant(config: Partial<TenantConfig>): Promise<TenantConfig> {
    const tier: TenantTier = config.tier ?? 'starter';
    const name = config.name ?? 'Unnamed Agency';
    const id = config.id ?? uuidv4();

    const tenant: TenantConfig = {
      id,
      name,
      slug: config.slug ?? slugify(name),
      tier,
      branding: config.branding ?? { ...PLATFORM_DEFAULTS },
      domains: config.domains ?? {},
      limits: config.limits ?? { ...TIER_LIMITS[tier] },
      billing: config.billing ?? defaultBilling(tier),
      settings: config.settings ?? {
        verticals: [],
        geographies: [],
        autoOutreach: true,
        humanReviewThreshold: 0.7,
      },
      createdAt: config.createdAt ?? new Date(),
      status: config.status ?? 'active',
    };

    tenantStore.set(id, tenant);
    return tenant;
  },

  /**
   * Retrieve a tenant by ID.
   * Requirement 7.8: tenant data isolation.
   */
  async getTenant(tenantId: string): Promise<TenantConfig> {
    const tenant = tenantStore.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    return tenant;
  },

  /**
   * Update tenant fields (partial update).
   */
  async updateTenant(tenantId: string, updates: Partial<TenantConfig>): Promise<TenantConfig> {
    const existing = await tenantManager.getTenant(tenantId);
    const updated: TenantConfig = {
      ...existing,
      ...updates,
      id: existing.id, // id is immutable
      createdAt: existing.createdAt, // createdAt is immutable
    };
    tenantStore.set(tenantId, updated);
    return updated;
  },

  /**
   * Suspend a tenant with a reason.
   */
  async suspendTenant(tenantId: string, reason: string): Promise<void> {
    const tenant = await tenantManager.getTenant(tenantId);
    const updated: TenantConfig = {
      ...tenant,
      status: 'suspended' as TenantStatus,
      settings: {
        ...tenant.settings,
        // Store suspension reason in settings for auditability
      },
    };
    // Attach reason as metadata (extend settings)
    (updated as TenantConfig & { suspensionReason?: string }).suspensionReason = reason;
    tenantStore.set(tenantId, updated);
  },

  /**
   * Get usage metrics for a tenant within a date range.
   * Requirement 7.7: per-tenant usage tracking.
   */
  async getUsageMetrics(tenantId: string, dateRange: DateRange): Promise<TenantUsage> {
    // Ensure tenant exists (isolation check)
    await tenantManager.getTenant(tenantId);

    const records = usageStore.get(tenantId) ?? [];
    const filtered = records.filter((r) => {
      const start = r.period.start.getTime();
      return start >= dateRange.start.getTime() && start <= dateRange.end.getTime();
    });

    // Aggregate
    const aggregate: TenantUsage = {
      tenantId,
      period: dateRange,
      prospectsDiscovered: filtered.reduce((s, r) => s + r.prospectsDiscovered, 0),
      auditsCompleted: filtered.reduce((s, r) => s + r.auditsCompleted, 0),
      proposalsGenerated: filtered.reduce((s, r) => s + r.proposalsGenerated, 0),
      emailsSent: filtered.reduce((s, r) => s + r.emailsSent, 0),
      dealsWon: filtered.reduce((s, r) => s + r.dealsWon, 0),
      apiRequestsUsed: filtered.reduce((s, r) => s + r.apiRequestsUsed, 0),
      costCents: filtered.reduce((s, r) => s + r.costCents, 0),
    };

    return aggregate;
  },

  /**
   * Apply tenant branding to client-facing content.
   * Replaces platform defaults with tenant-specific branding.
   * Requirement 7.4: apply agency branding to all client-facing outputs.
   */
  async applyBranding(tenantId: string, content: BrandableContent): Promise<BrandedContent> {
    const tenant = await tenantManager.getTenant(tenantId);
    const { branding } = tenant;

    let branded = content.content;

    // Replace platform defaults with tenant branding.
    // Use function replacer to avoid special replacement patterns ($`, $', $$, $&, $n).
    branded = replaceAll(branded, PLATFORM_DEFAULTS.companyName, branding.companyName);
    branded = replaceAll(branded, PLATFORM_DEFAULTS.logo, branding.logo);
    branded = replaceAll(branded, PLATFORM_DEFAULTS.contactEmail, branding.contactEmail);
    branded = replaceAll(branded, PLATFORM_DEFAULTS.supportEmail, branding.supportEmail);
    branded = replaceAll(branded, PLATFORM_DEFAULTS.primaryColor, branding.primaryColor);
    branded = replaceAll(branded, PLATFORM_DEFAULTS.secondaryColor, branding.secondaryColor);

    // Inject branding tokens if placeholders are present
    branded = replaceAll(branded, '{{companyName}}', branding.companyName);
    branded = replaceAll(branded, '{{logo}}', branding.logo);
    branded = replaceAll(branded, '{{contactEmail}}', branding.contactEmail);
    branded = replaceAll(branded, '{{primaryColor}}', branding.primaryColor);

    return {
      content: branded,
      appliedBranding: {
        logo: branded.includes(branding.logo),
        colors: branded.includes(branding.primaryColor),
        companyName: branded.includes(branding.companyName),
      },
    };
  },

  /**
   * Validate a custom domain (DNS check stub).
   * Requirement 7.3: support custom domains.
   */
  async validateDomain(domain: string): Promise<DomainValidation> {
    const errors: string[] = [];

    // Basic format validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    const valid = domainRegex.test(domain);
    if (!valid) {
      errors.push('Invalid domain format');
    }

    // Stub: in production this would do real DNS lookups
    const dnsConfigured = valid; // assume configured if format is valid (stub)
    const sslProvisioned = false; // SSL provisioning is async

    return {
      domain,
      valid,
      dnsConfigured,
      sslProvisioned,
      errors,
    };
  },

  /**
   * Provision a custom domain for a tenant.
   * Requirement 7.3: support custom domains for proposal/portal/widget.
   */
  async provisionDomain(
    tenantId: string,
    domain: string,
    type: 'proposal' | 'portal' | 'widget',
  ): Promise<void> {
    const validation = await tenantManager.validateDomain(domain);
    if (!validation.valid) {
      throw new Error(`Invalid domain: ${validation.errors.join(', ')}`);
    }

    const tenant = await tenantManager.getTenant(tenantId);
    const domainKey = `${type}Domain` as 'proposalDomain' | 'portalDomain' | 'widgetDomain';
    const updatedDomains = { ...tenant.domains, [domainKey]: domain };
    await tenantManager.updateTenant(tenantId, { domains: updatedDomains });
  },

  // ── Tier limit enforcement ─────────────────────────────────────────────────

  /**
   * Check whether a tenant can process more prospects today.
   * Returns true if under limit, false if limit reached.
   * Requirement 7.5: enforce tier limits.
   */
  async canProcessProspect(tenantId: string): Promise<boolean> {
    const tenant = await tenantManager.getTenant(tenantId);
    const today = todayString();
    const counter = dailyProspectCounters.get(tenantId);

    if (!counter || counter.date !== today) {
      return true; // new day, counter resets
    }

    return counter.count < tenant.limits.prospectsPerDay;
  },

  /**
   * Increment the daily prospect counter for a tenant.
   * Throws if the tier limit would be exceeded.
   */
  async recordProspectProcessed(tenantId: string): Promise<void> {
    const tenant = await tenantManager.getTenant(tenantId);
    const today = todayString();
    const existing = dailyProspectCounters.get(tenantId);

    if (!existing || existing.date !== today) {
      dailyProspectCounters.set(tenantId, { date: today, count: 1 });
      return;
    }

    if (existing.count >= tenant.limits.prospectsPerDay) {
      throw new Error(
        `Tier limit reached: tenant ${tenantId} has hit the ${tenant.tier} daily prospect limit of ${tenant.limits.prospectsPerDay}`,
      );
    }

    dailyProspectCounters.set(tenantId, { date: today, count: existing.count + 1 });
  },

  /**
   * Get the current daily prospect count for a tenant.
   */
  getDailyProspectCount(tenantId: string): number {
    const today = todayString();
    const counter = dailyProspectCounters.get(tenantId);
    if (!counter || counter.date !== today) return 0;
    return counter.count;
  },

  // ── Internal helpers exposed for testing ──────────────────────────────────

  /** Record a usage entry (used by pipeline to accumulate metrics). */
  recordUsage(tenantId: string, usage: Omit<TenantUsage, 'tenantId' | 'period'> & { period: DateRange }): void {
    const records = usageStore.get(tenantId) ?? [];
    records.push({ tenantId, ...usage });
    usageStore.set(tenantId, records);
  },

  /** Clear all in-memory state (for tests). */
  _reset(): void {
    tenantStore.clear();
    dailyProspectCounters.clear();
    usageStore.clear();
  },

  /** Expose store for isolation tests. */
  _getStore(): Map<string, TenantConfig> {
    return tenantStore;
  },

  /** Expose platform defaults for tests. */
  PLATFORM_DEFAULTS,
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Safe string replacement that avoids special `$` replacement patterns. */
function replaceAll(source: string, search: string, replacement: string): string {
  if (!search) return source;
  const escaped = escapeRegex(search);
  return source.replace(new RegExp(escaped, 'g'), () => replacement);
}
