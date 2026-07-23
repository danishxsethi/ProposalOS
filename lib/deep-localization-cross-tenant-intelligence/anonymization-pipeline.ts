/**
 * AnonymizationPipeline: Removes client-identifying information and applies privacy techniques.
 *
 * Implements:
 * - anonymizeMetrics()       - remove all client-identifying information
 * - removeIdentifyingInfo()  - strip client name, domain, contact info, email, phone
 * - field generalization     - location → region, size → category
 * - one-way hashing          - client ID hashed for re-audit matching
 * - applyDifferentialPrivacy() - delegates to DifferentialPrivacyEngine
 *
 * Requirements: 8.1, 8.2, 8.3, 12.1, 12.2
 */

import { createHash } from 'crypto';
import {
  RawAuditMetrics,
  AnonymizedAuditMetrics,
  AnonymizationConfig,
  GeneralizationRule,
  ValidationResult,
  AuditLog,
} from './types';
import { DifferentialPrivacyEngine } from './differential-privacy-engine';

// ============================================================================
// Default configuration
// ============================================================================

const DEFAULT_FIELDS_TO_REMOVE = [
  'clientName',
  'domain',
  'contactInfo',
  'email',
  'phone',
  'address',
  'firstName',
  'lastName',
  'fullName',
  'name',
  'url',
  'website',
];

const DEFAULT_FIELDS_TO_GENERALIZE: Map<string, GeneralizationRule> = new Map([
  [
    'location',
    {
      field: 'location',
      generalizationType: 'aggregate',
      parameters: { outputField: 'region' },
    },
  ],
  [
    'businessSize',
    {
      field: 'businessSize',
      generalizationType: 'aggregate',
      parameters: { outputField: 'sizeCategory' },
    },
  ],
]);

const DEFAULT_CONFIG: AnonymizationConfig = {
  fieldsToRemove: DEFAULT_FIELDS_TO_REMOVE,
  fieldsToGeneralize: DEFAULT_FIELDS_TO_GENERALIZE,
  differentialPrivacyEpsilon: 1.0,
  kAnonymityMinimum: 10,
};

// ============================================================================
// Location → Region mapping
// ============================================================================

const LOCATION_TO_REGION: Record<string, string> = {
  // US states → regions
  OR: 'west',
  WA: 'west',
  NV: 'west',
  AZ: 'southwest',
  NM: 'southwest',
  TX: 'south',
  FL: 'south',
  GA: 'south',
  NY: 'northeast',
  MA: 'northeast',
  PA: 'northeast',
  IL: 'midwest',
  OH: 'midwest',
  MI: 'midwest',
  // Countries → regions
  US: 'north-america',
  CA: 'north-america', // Canada (country code takes precedence over US state)
  MX: 'north-america',
  GB: 'europe',
  DE: 'europe',
  FR: 'europe',
  ES: 'europe',
  IT: 'europe',
  AU: 'oceania',
  NZ: 'oceania',
  JP: 'asia-pacific',
  CN: 'asia-pacific',
  KR: 'asia-pacific',
  IN: 'asia-pacific',
  BR: 'south-america',
  AR: 'south-america',
};

// ============================================================================
// Business size → category mapping
// ============================================================================

function generalizeBusinessSize(size: string): string {
  const normalized = (size || '').toLowerCase().trim();
  if (['small', 'micro', 'solo', 'freelancer', '1-10', '1-9'].includes(normalized)) {
    return 'small';
  }
  if (['medium', 'mid', 'smb', '10-50', '11-50', '50-200', '51-200'].includes(normalized)) {
    return 'medium';
  }
  if (['large', 'enterprise', 'corporate', '200+', '201+', '1000+'].includes(normalized)) {
    return 'large';
  }
  // Numeric employee counts
  const num = parseInt(normalized, 10);
  if (!isNaN(num)) {
    if (num <= 10) return 'small';
    if (num <= 200) return 'medium';
    return 'large';
  }
  return 'unknown';
}

function generalizeLocation(location: string): string {
  if (!location) return 'unknown';
  const upper = location.toUpperCase().trim();
  return LOCATION_TO_REGION[upper] ?? 'other';
}

// ============================================================================
// PII detection helpers
// ============================================================================

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?[\d\s\-().]{7,20})/g;
const DOMAIN_REGEX = /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/\S*)?\b/g;

/**
 * Scrub PII patterns from a string value.
 */
function scrubStringValue(value: string): string {
  return value
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(PHONE_REGEX, (match) => {
      // Only replace if it looks like a real phone number (7+ digits)
      const digits = match.replace(/\D/g, '');
      return digits.length >= 7 ? '[REDACTED_PHONE]' : match;
    })
    .replace(DOMAIN_REGEX, '[REDACTED_DOMAIN]');
}

// ============================================================================
// AnonymizationPipeline
// ============================================================================

export class AnonymizationPipeline {
  private config: AnonymizationConfig;
  private dpEngine: DifferentialPrivacyEngine;
  private privacyConcernHandlers: Array<(errors: string[], data: AnonymizedAuditMetrics) => Promise<void>> = [];

  constructor(config: Partial<AnonymizationConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      fieldsToRemove: config.fieldsToRemove ?? DEFAULT_CONFIG.fieldsToRemove,
      fieldsToGeneralize: config.fieldsToGeneralize ?? DEFAULT_CONFIG.fieldsToGeneralize,
    };
    this.dpEngine = new DifferentialPrivacyEngine({
      epsilon: this.config.differentialPrivacyEpsilon,
      sensitivity: 1.0,
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Anonymize raw audit metrics by removing all client-identifying information,
   * generalizing fields, and hashing the client ID.
   *
   * Validates: Requirements 8.1, 8.2, 12.1
   */
  async anonymizeMetrics(rawMetrics: RawAuditMetrics): Promise<AnonymizedAuditMetrics> {
    // 1. Hash client ID (one-way, for re-audit matching)
    const anonymousId = this.hashClientId(rawMetrics.clientId);

    // 2. Extract non-identifying fields from auditResults
    const cleanedResults = await this.removeIdentifyingInfo(rawMetrics.auditResults ?? {});

    // 3. Extract industry, locale, and business size from audit results
    const industry = this.extractField(cleanedResults, 'industry') ?? 'unknown';
    const locale = this.extractField(cleanedResults, 'locale') ?? 'en-US';
    const rawSize = this.extractField(rawMetrics.auditResults, 'businessSize') ?? 'unknown';
    const businessSize = generalizeBusinessSize(rawSize);

    // 4. Extract numeric metrics (strip any PII-bearing keys)
    const metrics = this.extractMetrics(cleanedResults);

    // Sanitize timestamp: if raw timestamp is invalid (e.g. new Date(NaN)), use current time
    const rawTs = rawMetrics.timestamp;
    const timestamp =
      rawTs instanceof Date && !isNaN(rawTs.getTime()) ? rawTs : new Date();

    return {
      anonymousId,
      industry,
      businessSize,
      locale,
      metrics,
      timestamp,
      differentialPrivacyNoise: 0, // Noise applied separately via applyDifferentialPrivacy()
    };
  }

  /**
   * Remove all client-identifying information from an arbitrary data object.
   * Strips: client name, domain, contact info, email, phone, and any field
   * listed in config.fieldsToRemove.
   *
   * Validates: Requirements 8.2, 12.1
   */
  async removeIdentifyingInfo(data: any): Promise<any> {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') return scrubStringValue(data);
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) {
      return Promise.all(data.map((item) => this.removeIdentifyingInfo(item)));
    }

    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Drop fields that are in the removal list (case-insensitive key match)
      if (this.isIdentifyingField(key)) {
        continue;
      }

      // Apply generalization rules
      const generalizationRule = this.config.fieldsToGeneralize.get(key);
      if (generalizationRule) {
        const generalized = this.applyGeneralization(key, value, generalizationRule);
        if (generalized !== undefined) {
          const outputField = generalizationRule.parameters?.outputField ?? key;
          cleaned[outputField] = generalized;
        }
        continue;
      }

      // Recurse into nested objects/arrays
      cleaned[key] = await this.removeIdentifyingInfo(value);
    }

    return cleaned;
  }

  /**
   * Apply differential privacy noise to metric values using the Laplace mechanism.
   * Delegates to DifferentialPrivacyEngine for noise generation.
   *
   * Validates: Requirements 8.3, 12.2
   */
  async applyDifferentialPrivacy(
    data: AnonymizedAuditMetrics,
    epsilon: number = this.config.differentialPrivacyEpsilon
  ): Promise<AnonymizedAuditMetrics> {
    return this.dpEngine.applyDifferentialPrivacy(data, epsilon);
  }

  /**
   * Validate that anonymized data contains no identifying information and
   * satisfies all privacy compliance requirements.
   *
   * Checks performed:
   * - anonymousId is a valid SHA-256 hex hash
   * - No PII patterns (email, phone, domain) in text fields
   * - All metric values are finite numbers
   * - differentialPrivacyNoise field is present
   * - Required fields (industry, businessSize, locale) are non-empty strings
   *
   * If any privacy concern is detected (errors), the privacyConcernDetected
   * flag is set on the result and the registered alert handler is called.
   *
   * Validates: Requirements 12.1, 12.4, 12.5
   */
  async validateAnonymization(data: AnonymizedAuditMetrics): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check anonymous ID is a hash (64 hex chars for SHA-256)
    if (!data.anonymousId || !/^[a-f0-9]{64}$/.test(data.anonymousId)) {
      errors.push('anonymousId must be a SHA-256 hex hash');
    }

    // 2. Required fields must be non-empty strings
    if (!data.industry || typeof data.industry !== 'string' || data.industry.trim() === '') {
      errors.push('industry must be a non-empty string');
    }
    if (!data.businessSize || typeof data.businessSize !== 'string' || data.businessSize.trim() === '') {
      errors.push('businessSize must be a non-empty string');
    }
    if (!data.locale || typeof data.locale !== 'string' || data.locale.trim() === '') {
      errors.push('locale must be a non-empty string');
    }

    // 3. Check no PII patterns in text fields
    const textFields: Array<[string, string]> = [
      ['industry', data.industry],
      ['locale', data.locale],
      ['businessSize', data.businessSize],
    ];
    // Reset regex lastIndex before use (global flag)
    for (const [fieldName, fieldValue] of textFields) {
      if (typeof fieldValue === 'string') {
        EMAIL_REGEX.lastIndex = 0;
        PHONE_REGEX.lastIndex = 0;
        DOMAIN_REGEX.lastIndex = 0;
        if (EMAIL_REGEX.test(fieldValue)) {
          errors.push(`PII (email) detected in field '${fieldName}': ${fieldValue}`);
        }
        PHONE_REGEX.lastIndex = 0;
        if (PHONE_REGEX.test(fieldValue)) {
          const digits = fieldValue.replace(/\D/g, '');
          if (digits.length >= 7) {
            warnings.push(`Possible phone number in field '${fieldName}'`);
          }
        }
        DOMAIN_REGEX.lastIndex = 0;
        if (DOMAIN_REGEX.test(fieldValue)) {
          warnings.push(`Possible domain/URL in field '${fieldName}'`);
        }
      }
    }

    // 4. Check metrics are numeric and finite
    if (!(data.metrics instanceof Map)) {
      errors.push('metrics must be a Map<string, number>');
    } else {
      for (const [key, value] of data.metrics.entries()) {
        if (typeof value !== 'number' || !isFinite(value)) {
          errors.push(`Metric '${key}' is not a finite number`);
        }
      }
    }

    // 5. differentialPrivacyNoise must be a number
    if (typeof data.differentialPrivacyNoise !== 'number') {
      errors.push('differentialPrivacyNoise must be a number');
    }

    // 6. timestamp must be a Date
    if (!(data.timestamp instanceof Date) || isNaN(data.timestamp.getTime())) {
      errors.push('timestamp must be a valid Date');
    }

    const result: ValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    // 7. Alert operators if any privacy concern detected (Req 12.5)
    if (!result.isValid) {
      await this.alertPrivacyConcern(errors, data);
    }

    return result;
  }

  /**
   * Produce a compliance audit log entry for an anonymization operation.
   *
   * The log entry includes:
   * - timestamp of the operation
   * - operation name
   * - anonymousId (hashed, non-reversible)
   * - cohort fields: industry, businessSize, locale
   * - metricCount: number of metrics extracted
   * - differentialPrivacyNoise: noise level applied
   * - complianceStatus: 'compliant' | 'non-compliant'
   * - validationErrors: any errors from validateAnonymization
   *
   * Validates: Requirements 12.4
   */
  async auditAnonymization(data: AnonymizedAuditMetrics): Promise<AuditLog> {
    // Run validation to determine compliance status
    const validation = await this.validateAnonymization(data);

    return {
      timestamp: new Date(),
      operation: 'anonymize_metrics',
      details: {
        anonymousId: data.anonymousId,
        industry: data.industry,
        businessSize: data.businessSize,
        locale: data.locale,
        metricCount: data.metrics instanceof Map ? data.metrics.size : 0,
        differentialPrivacyNoise: data.differentialPrivacyNoise,
        complianceStatus: validation.isValid ? 'compliant' : 'non-compliant',
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      },
    };
  }

  /**
   * Register a handler to be called when a privacy concern is detected.
   * Allows operators to receive immediate alerts (Req 12.5).
   *
   * @param handler - async function called with error messages and the offending data
   */
  onPrivacyConcern(handler: (errors: string[], data: AnonymizedAuditMetrics) => Promise<void>): void {
    this.privacyConcernHandlers.push(handler);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Invoke all registered privacy concern handlers.
   * Validates: Requirements 12.5
   */
  private async alertPrivacyConcern(errors: string[], data: AnonymizedAuditMetrics): Promise<void> {
    for (const handler of this.privacyConcernHandlers) {
      try {
        await handler(errors, data);
      } catch {
        // Handlers must not crash the pipeline; log silently
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * One-way SHA-256 hash of a client ID.
   * Deterministic so the same client can be matched across re-audits.
   */
  private hashClientId(clientId: string): string {
    return createHash('sha256').update(clientId).digest('hex');
  }

  /**
   * Check whether a field key is in the identifying-fields removal list.
   */
  private isIdentifyingField(key: string): boolean {
    const lower = key.toLowerCase();
    return this.config.fieldsToRemove.some((f) => f.toLowerCase() === lower);
  }

  /**
   * Apply a generalization rule to a field value.
   */
  private applyGeneralization(
    field: string,
    value: any,
    rule: GeneralizationRule
  ): any {
    switch (rule.generalizationType) {
      case 'suppress':
        return undefined;
      case 'hash':
        return typeof value === 'string'
          ? createHash('sha256').update(value).digest('hex')
          : undefined;
      case 'round':
        return typeof value === 'number'
          ? Math.round(value / (rule.parameters?.precision ?? 1)) *
              (rule.parameters?.precision ?? 1)
          : value;
      case 'aggregate':
        if (field === 'location') return generalizeLocation(String(value ?? ''));
        if (field === 'businessSize') return generalizeBusinessSize(String(value ?? ''));
        return value;
      default:
        return value;
    }
  }

  /**
   * Extract a top-level field from an object (case-insensitive).
   */
  private extractField(obj: any, fieldName: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const lower = fieldName.toLowerCase();
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase() === lower && typeof value === 'string') {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Extract numeric metrics from a cleaned audit results object.
   * Only includes numeric leaf values; skips nested objects.
   */
  private extractMetrics(data: any): Map<string, number> {
    const metrics = new Map<string, number>();
    if (!data || typeof data !== 'object') return metrics;

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number' && isFinite(value)) {
        metrics.set(key, value);
      }
    }
    return metrics;
  }
}
