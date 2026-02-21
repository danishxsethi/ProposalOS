/**
 * Property-based tests for AnonymizationPipeline – validation and audit logging
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 5.5: Implement validation and audit logging
 *   - validateAnonymization() verifies privacy compliance
 *   - auditAnonymization() logs all anonymization operations
 *
 * Requirements: 12.4, 12.5
 */

import * as fc from 'fast-check';
import { AnonymizationPipeline } from '../anonymization-pipeline';
import { AnonymizedAuditMetrics, RawAuditMetrics } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid AnonymizedAuditMetrics (as produced by anonymizeMetrics) */
function makeValidAnonymized(overrides: Partial<AnonymizedAuditMetrics> = {}): AnonymizedAuditMetrics {
  return {
    anonymousId: 'a'.repeat(64), // valid SHA-256 hex placeholder
    industry: 'dental',
    businessSize: 'small',
    locale: 'en-US',
    metrics: new Map([['score', 80], ['pageSpeed', 90]]),
    timestamp: new Date('2024-01-15T10:00:00Z'),
    differentialPrivacyNoise: 0.5,
    ...overrides,
  };
}

function makeRawMetrics(overrides: Partial<RawAuditMetrics> = {}): RawAuditMetrics {
  return {
    clientId: 'client-abc-123',
    clientName: 'Acme Corp',
    domain: 'acme.com',
    contactInfo: 'john@acme.com',
    auditResults: {
      industry: 'dental',
      locale: 'en-US',
      businessSize: 'small',
      score: 72,
      pageSpeed: 85,
    },
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const validHashArb = fc.stringMatching(/^[a-f0-9]{64}$/);

const industryArb = fc.oneof(
  fc.constant('dental'),
  fc.constant('medical'),
  fc.constant('legal'),
  fc.constant('retail'),
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
);

const businessSizeArb = fc.oneof(
  fc.constant('small'),
  fc.constant('medium'),
  fc.constant('large'),
);

const localeArb = fc.oneof(
  fc.constant('en-US'),
  fc.constant('en-GB'),
  fc.constant('en-CA'),
  fc.constant('en-AU'),
  fc.constant('de-DE'),
  fc.constant('fr-FR'),
  fc.constant('es-ES'),
);

const metricMapArb = fc
  .array(
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
      fc.float({ min: 0, max: 1000, noNaN: true }),
    ),
    { minLength: 0, maxLength: 10 },
  )
  .map((entries) => new Map(entries));

const validAnonymizedArb = fc.record({
  anonymousId: validHashArb,
  industry: industryArb,
  businessSize: businessSizeArb,
  locale: localeArb,
  metrics: metricMapArb,
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).filter((d) => !isNaN(d.getTime())),
  differentialPrivacyNoise: fc.float({ min: 0, max: 10, noNaN: true }),
});

const clientIdArb = fc.string({ minLength: 1, maxLength: 64 });

const rawAuditMetricsArb = fc.record({
  clientId: clientIdArb,
  clientName: fc.string({ minLength: 1, maxLength: 80 }),
  domain: fc.domain(),
  contactInfo: fc.emailAddress(),
  auditResults: fc.record({
    industry: industryArb,
    locale: localeArb,
    businessSize: businessSizeArb,
    score: fc.float({ min: 0, max: 100, noNaN: true }),
    pageSpeed: fc.float({ min: 0, max: 100, noNaN: true }),
  }),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
});

// ---------------------------------------------------------------------------
// Validation tests – Requirements 12.4, 12.5
// ---------------------------------------------------------------------------

describe('validateAnonymization – privacy compliance verification', () => {
  const pipeline = new AnonymizationPipeline();

  /**
   * Validates: Requirements 12.4
   * Any properly anonymized record must pass validation.
   */
  it('should return isValid=true for any well-formed anonymized record', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const result = await pipeline.validateAnonymization(data);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * Records produced by anonymizeMetrics() must always pass validation.
   */
  it('should pass validation for any record produced by anonymizeMetrics()', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw) => {
        const anonymized = await pipeline.anonymizeMetrics(raw);
        const result = await pipeline.validateAnonymization(anonymized);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * A record with an invalid anonymousId (not a SHA-256 hash) must fail validation.
   */
  it('should return isValid=false when anonymousId is not a SHA-256 hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 63 }).filter((s) => !/^[a-f0-9]{64}$/.test(s)),
        async (badId) => {
          const data = makeValidAnonymized({ anonymousId: badId });
          const result = await pipeline.validateAnonymization(data);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * A record with an email address in the industry field must fail validation.
   */
  it('should detect PII (email) in text fields and return isValid=false', async () => {
    // Use emails that match our detection regex (standard alphanumeric format)
    const standardEmailArb = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z0-9._%+\-]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z0-9\-]{1,20}$/),
        fc.stringMatching(/^[a-zA-Z]{2,4}$/),
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    await fc.assert(
      fc.asyncProperty(standardEmailArb, async (email) => {
        const data = makeValidAnonymized({ industry: email });
        const result = await pipeline.validateAnonymization(data);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.includes('PII') || e.includes('email'))).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * Non-finite metric values must fail validation.
   */
  it('should return isValid=false when a metric value is non-finite', async () => {
    const badValues = [NaN, Infinity, -Infinity];
    for (const badVal of badValues) {
      const data = makeValidAnonymized({
        metrics: new Map([['score', badVal]]),
      });
      const result = await pipeline.validateAnonymization(data);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  /**
   * Validates: Requirements 12.4
   * Empty required string fields must fail validation.
   */
  it('should return isValid=false when required string fields are empty', async () => {
    const emptyIndustry = makeValidAnonymized({ industry: '' });
    const r1 = await pipeline.validateAnonymization(emptyIndustry);
    expect(r1.isValid).toBe(false);

    const emptyLocale = makeValidAnonymized({ locale: '' });
    const r2 = await pipeline.validateAnonymization(emptyLocale);
    expect(r2.isValid).toBe(false);

    const emptySize = makeValidAnonymized({ businessSize: '' });
    const r3 = await pipeline.validateAnonymization(emptySize);
    expect(r3.isValid).toBe(false);
  });

  /**
   * Validates: Requirements 12.5
   * When a privacy concern is detected, the registered alert handler must be called.
   */
  it('should call privacy concern handler when validation fails (Req 12.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 63 }).filter((s) => !/^[a-f0-9]{64}$/.test(s)),
        async (badId) => {
          const alertPipeline = new AnonymizationPipeline();
          const alertedErrors: string[][] = [];

          alertPipeline.onPrivacyConcern(async (errors) => {
            alertedErrors.push(errors);
          });

          const data = makeValidAnonymized({ anonymousId: badId });
          const result = await alertPipeline.validateAnonymization(data);

          expect(result.isValid).toBe(false);
          expect(alertedErrors.length).toBeGreaterThan(0);
          expect(alertedErrors[0].length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 12.5
   * No alert handler should be called when validation passes.
   */
  it('should NOT call privacy concern handler when validation passes', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const alertPipeline = new AnonymizationPipeline();
        let alertCalled = false;

        alertPipeline.onPrivacyConcern(async () => {
          alertCalled = true;
        });

        const result = await alertPipeline.validateAnonymization(data);
        expect(result.isValid).toBe(true);
        expect(alertCalled).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Audit logging tests – Requirements 12.4
// ---------------------------------------------------------------------------

describe('auditAnonymization – compliance audit logging', () => {
  const pipeline = new AnonymizationPipeline();

  /**
   * Validates: Requirements 12.4
   * Every anonymization operation must produce an audit log entry.
   */
  it('should produce an audit log for any anonymized record', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);

        expect(log).toBeDefined();
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.operation).toBe('anonymize_metrics');
        expect(log.details).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * The audit log must include the anonymousId for traceability.
   */
  it('should include anonymousId in audit log details for any record', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);
        expect(log.details.anonymousId).toBe(data.anonymousId);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * The audit log must include cohort fields (industry, businessSize, locale).
   */
  it('should include cohort fields in audit log details for any record', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);
        expect(log.details.industry).toBe(data.industry);
        expect(log.details.businessSize).toBe(data.businessSize);
        expect(log.details.locale).toBe(data.locale);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * The audit log must include a compliance status field.
   */
  it('should include complianceStatus in audit log details', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);
        expect(['compliant', 'non-compliant']).toContain(log.details.complianceStatus);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * Compliant records must have complianceStatus='compliant' and no validation errors.
   */
  it('should mark compliant records as compliant in audit log', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);
        expect(log.details.complianceStatus).toBe('compliant');
        expect(log.details.validationErrors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * Non-compliant records must have complianceStatus='non-compliant' and validation errors.
   */
  it('should mark non-compliant records as non-compliant in audit log', async () => {
    const badData = makeValidAnonymized({ anonymousId: 'not-a-hash' });
    const log = await pipeline.auditAnonymization(badData);
    expect(log.details.complianceStatus).toBe('non-compliant');
    expect(log.details.validationErrors.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 12.4
   * The audit log must include metricCount and differentialPrivacyNoise.
   */
  it('should include metricCount and differentialPrivacyNoise in audit log', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const log = await pipeline.auditAnonymization(data);
        expect(typeof log.details.metricCount).toBe('number');
        expect(log.details.metricCount).toBe(data.metrics.size);
        expect(typeof log.details.differentialPrivacyNoise).toBe('number');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * Audit logs produced by the full pipeline (anonymizeMetrics → auditAnonymization)
   * must always be compliant.
   */
  it('should produce compliant audit logs for records from anonymizeMetrics()', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw) => {
        const anonymized = await pipeline.anonymizeMetrics(raw);
        const log = await pipeline.auditAnonymization(anonymized);
        expect(log.details.complianceStatus).toBe('compliant');
        expect(log.details.validationErrors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 12.4
   * The audit log timestamp must be a recent Date (within a few seconds of now).
   */
  it('should set audit log timestamp to current time', async () => {
    await fc.assert(
      fc.asyncProperty(validAnonymizedArb, async (data) => {
        const before = Date.now();
        const log = await pipeline.auditAnonymization(data);
        const after = Date.now();

        const logTime = log.timestamp.getTime();
        expect(logTime).toBeGreaterThanOrEqual(before);
        expect(logTime).toBeLessThanOrEqual(after + 100); // small tolerance
      }),
      { numRuns: 50 },
    );
  });
});
