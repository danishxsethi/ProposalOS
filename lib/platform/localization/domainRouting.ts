/**
 * Domain Routing and Data Residency
 * Handles country-specific TLD routing and data residency region selection.
 *
 * Requirements: 18.5, 18.6
 */

import { SupportedCountry } from './localizationEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageConfig {
  region: string;
  encryptionRequired: boolean;
  retentionDays: number;
  crossRegionReplicationAllowed: boolean;
}

// ---------------------------------------------------------------------------
// Domain TLD mapping
// ---------------------------------------------------------------------------

/** Country → TLD suffix (without leading dot) */
const COUNTRY_TLD: Partial<Record<SupportedCountry, string>> = {
  uk: 'co.uk',
  ca: 'ca',
  au: 'com.au',
};

/**
 * Returns the country-specific domain for a given base domain.
 * - UK  → `<base>.co.uk`
 * - CA  → `<base>.ca`
 * - AU  → `<base>.com.au`
 * - All others → `<base>.com` (US default)
 *
 * Requirement 18.5 — country-specific domain infrastructure.
 */
export function getCountryDomain(baseDomain: string, country: SupportedCountry): string {
  const tld = COUNTRY_TLD[country];
  if (!tld) {
    // Default to .com for US and any country without a specific TLD
    return `${baseDomain}.com`;
  }
  return `${baseDomain}.${tld}`;
}

// ---------------------------------------------------------------------------
// Data residency region mapping
// ---------------------------------------------------------------------------

/** Country → AWS region for data residency compliance */
const DATA_RESIDENCY_REGION: Record<SupportedCountry, string> = {
  uk: 'eu-west-1',   // London — UK GDPR
  es: 'eu-west-1',   // Ireland — EU GDPR
  ca: 'ca-central-1', // Canada — PIPEDA
  au: 'ap-southeast-2', // Sydney — Australian Privacy Act
  br: 'sa-east-1',   // São Paulo — LGPD
  us: 'us-east-1',   // N. Virginia — default
};

/**
 * Returns the AWS region that satisfies data residency requirements for the
 * given country.
 *
 * Requirement 18.6 — country-specific data residency requirements.
 */
export function getDataResidencyRegion(country: SupportedCountry): string {
  return DATA_RESIDENCY_REGION[country];
}

// ---------------------------------------------------------------------------
// Domain → country detection
// ---------------------------------------------------------------------------

/**
 * Detects the country from a domain's TLD.
 * Returns `null` when no match is found.
 *
 * Requirement 18.5 — country-specific domain infrastructure.
 */
export function detectCountryFromDomain(domain: string): SupportedCountry | null {
  const lower = domain.toLowerCase().trim();

  // Check multi-part TLDs first (longest match)
  if (lower.endsWith('.co.uk')) return 'uk';
  if (lower.endsWith('.com.au')) return 'au';
  if (lower.endsWith('.ca')) return 'ca';
  if (lower.endsWith('.es')) return 'es';
  if (lower.endsWith('.com.br') || lower.endsWith('.br')) return 'br';
  if (lower.endsWith('.com')) return 'us';

  return null;
}

// ---------------------------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------------------------

/** Per-country storage configuration */
const STORAGE_CONFIGS: Record<SupportedCountry, StorageConfig> = {
  uk: {
    region: 'eu-west-1',
    encryptionRequired: true,   // UK GDPR mandates encryption at rest
    retentionDays: 365 * 3,     // 3-year retention under UK GDPR
    crossRegionReplicationAllowed: false, // data must stay in EU/UK
  },
  es: {
    region: 'eu-west-1',
    encryptionRequired: true,   // GDPR + LOPDGDD
    retentionDays: 365 * 3,
    crossRegionReplicationAllowed: false,
  },
  ca: {
    region: 'ca-central-1',
    encryptionRequired: true,   // PIPEDA requires reasonable safeguards
    retentionDays: 365 * 2,     // 2-year retention under PIPEDA
    crossRegionReplicationAllowed: false, // data must stay in Canada
  },
  au: {
    region: 'ap-southeast-2',
    encryptionRequired: true,   // Australian Privacy Act
    retentionDays: 365 * 7,     // 7-year retention (Australian tax/business records)
    crossRegionReplicationAllowed: false,
  },
  br: {
    region: 'sa-east-1',
    encryptionRequired: true,   // LGPD requires appropriate security measures
    retentionDays: 365 * 5,     // 5-year retention under LGPD
    crossRegionReplicationAllowed: false,
  },
  us: {
    region: 'us-east-1',
    encryptionRequired: false,  // No federal mandate (CCPA doesn't require encryption)
    retentionDays: 365 * 7,     // 7-year default for business records
    crossRegionReplicationAllowed: true,
  },
};

/**
 * Returns the full storage configuration for a country, including the
 * residency region, encryption requirements, and retention policy.
 *
 * Requirement 18.6 — country-specific data residency requirements.
 */
export function getStorageConfig(country: SupportedCountry): StorageConfig {
  return STORAGE_CONFIGS[country];
}
