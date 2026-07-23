/**
 * Domain Manager — White-Label Platform
 * DNS validation, custom domain provisioning, and SSL certificate provisioning (stub).
 * Requirement: 7.3
 */

import type { DomainValidation } from '../types';
import { tenantManager } from './tenantManager';

// ── In-memory stores ─────────────────────────────────────────────────────────

interface ProvisionedDomain {
  tenantId: string;
  domain: string;
  type: 'proposal' | 'portal' | 'widget';
  sslStatus: 'pending' | 'provisioned' | 'failed';
  provisionedAt: Date;
}

const domainStore = new Map<string, ProvisionedDomain>(); // domain → record

// ── Helpers ──────────────────────────────────────────────────────────────────

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

// Reserved platform domains that tenants cannot claim
const RESERVED_DOMAINS = new Set([
  'proposalengine.io',
  'app.proposalengine.io',
  'api.proposalengine.io',
  'widget.proposalengine.io',
]);

// ── DomainManager implementation ─────────────────────────────────────────────

export const domainManager = {
  /**
   * Validate a domain for DNS correctness and availability.
   * Requirement 7.3: support custom domains.
   */
  async validateDomain(domain: string): Promise<DomainValidation> {
    const errors: string[] = [];

    // Format check
    const valid = DOMAIN_REGEX.test(domain);
    if (!valid) {
      errors.push('Invalid domain format');
    }

    // Reserved domain check
    if (RESERVED_DOMAINS.has(domain.toLowerCase())) {
      errors.push('Domain is reserved by the platform');
    }

    // Already provisioned to another tenant?
    const existing = domainStore.get(domain.toLowerCase());
    if (existing) {
      errors.push('Domain is already provisioned to another tenant');
    }

    // Stub DNS check: in production this would do real DNS lookups (A/CNAME records)
    const dnsConfigured = valid && errors.length === 0;

    return {
      domain,
      valid: errors.length === 0,
      dnsConfigured,
      sslProvisioned: false, // SSL is async
      errors,
    };
  },

  /**
   * Provision a custom domain for a tenant (proposal/portal/widget).
   * Triggers SSL certificate provisioning asynchronously (stub).
   * Requirement 7.3.
   */
  async provisionDomain(
    tenantId: string,
    domain: string,
    type: 'proposal' | 'portal' | 'widget',
  ): Promise<void> {
    const validation = await domainManager.validateDomain(domain);
    if (!validation.valid) {
      throw new Error(`Domain validation failed: ${validation.errors.join('; ')}`);
    }

    // Ensure tenant exists
    await tenantManager.getTenant(tenantId);

    // Store provisioned domain
    const record: ProvisionedDomain = {
      tenantId,
      domain: domain.toLowerCase(),
      type,
      sslStatus: 'pending',
      provisionedAt: new Date(),
    };
    domainStore.set(domain.toLowerCase(), record);

    // Update tenant's domain config
    await tenantManager.provisionDomain(tenantId, domain, type);

    // Stub: trigger async SSL provisioning
    void domainManager._provisionSSL(domain);
  },

  /**
   * SSL certificate provisioning stub.
   * In production this would call Let's Encrypt / AWS ACM / Cloudflare.
   */
  async _provisionSSL(domain: string): Promise<void> {
    const record = domainStore.get(domain.toLowerCase());
    if (!record) return;

    // Simulate async provisioning (immediate in stub)
    domainStore.set(domain.toLowerCase(), { ...record, sslStatus: 'provisioned' });
  },

  /**
   * Get provisioning status for a domain.
   */
  async getDomainStatus(domain: string): Promise<ProvisionedDomain | null> {
    return domainStore.get(domain.toLowerCase()) ?? null;
  },

  /**
   * List all domains provisioned for a tenant.
   */
  async listTenantDomains(tenantId: string): Promise<ProvisionedDomain[]> {
    const results: ProvisionedDomain[] = [];
    for (const record of domainStore.values()) {
      if (record.tenantId === tenantId) {
        results.push(record);
      }
    }
    return results;
  },

  /**
   * Remove a provisioned domain.
   */
  async deprovisionDomain(tenantId: string, domain: string): Promise<void> {
    const record = domainStore.get(domain.toLowerCase());
    if (!record) {
      throw new Error(`Domain not found: ${domain}`);
    }
    if (record.tenantId !== tenantId) {
      throw new Error('Domain does not belong to this tenant');
    }
    domainStore.delete(domain.toLowerCase());
  },

  /** Clear all in-memory state (for tests). */
  _reset(): void {
    domainStore.clear();
  },
};
