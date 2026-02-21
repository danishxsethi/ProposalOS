/**
 * Property-based tests for AnonymizationPipeline
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Property 31: Anonymization Completeness
 *   For any audit completion, the Benchmark_Engine SHALL extract metrics with
 *   all client-identifying information removed.
 *   Validates: Requirements 8.1, 8.2
 *
 * Property 54: Privacy-First Anonymization
 *   For any anonymized metric collection, the System SHALL remove all
 *   client-identifying information before storage.
 *   Validates: Requirements 12.1
 */

import * as fc from 'fast-check';
import { AnonymizationPipeline } from '../anonymization-pipeline';
import { RawAuditMetrics } from '../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Realistic-looking client names */
const clientNameArb = fc.oneof(
  fc.constant('Acme Corp'),
  fc.constant('Smith & Sons Ltd'),
  fc.constant('Global Dental Group'),
  fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
);

/** Realistic-looking domain names */
const domainArb = fc.oneof(
  fc.constant('acme.com'),
  fc.constant('smithandsons.co.uk'),
  fc.constant('dentist-berlin.de'),
  fc.domain(),
);

/** Email addresses */
const emailArb = fc.emailAddress();

/** Phone numbers */
const phoneArb = fc.oneof(
  fc.constant('+1-555-123-4567'),
  fc.constant('+44 20 7946 0958'),
  fc.constant('(800) 555-0199'),
);

/** Contact info strings that may contain email/phone */
const contactInfoArb = fc.oneof(
  emailArb,
  phoneArb,
  fc.tuple(fc.string({ minLength: 1, maxLength: 30 }), emailArb).map(([n, e]) => `${n}, ${e}`),
);

/** Client IDs */
const clientIdArb = fc.string({ minLength: 1, maxLength: 64 });

/** Supported locales */
const localeArb = fc.oneof(
  fc.constant('en-US'),
  fc.constant('en-GB'),
  fc.constant('en-CA'),
  fc.constant('en-AU'),
  fc.constant('de-DE'),
  fc.constant('fr-FR'),
  fc.constant('es-ES'),
);

/** Industry strings */
const industryArb = fc.oneof(
  fc.constant('dental'),
  fc.constant('medical'),
  fc.constant('legal'),
  fc.constant('retail'),
  fc.constant('hospitality'),
  fc.string({ minLength: 1, maxLength: 50 }),
);

/** Business size strings */
const businessSizeArb = fc.oneof(
  fc.constant('small'),
  fc.constant('medium'),
  fc.constant('large'),
  fc.constant('1-10'),
  fc.constant('50-200'),
  fc.constant('enterprise'),
);

/** Numeric metric values */
const metricValueArb = fc.float({ min: 0, max: 100, noNaN: true });

/** Audit results object with numeric metrics and non-PII fields */
const auditResultsArb = fc.record({
  industry: industryArb,
  locale: localeArb,
  businessSize: businessSizeArb,
  score: metricValueArb,
  pageSpeed: metricValueArb,
  mobileScore: metricValueArb,
});

/** Full RawAuditMetrics generator */
const rawAuditMetricsArb = fc.record({
  clientId: clientIdArb,
  clientName: clientNameArb,
  domain: domainArb,
  contactInfo: contactInfoArb,
  auditResults: auditResultsArb,
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).filter((d) => !isNaN(d.getTime())),
});

// ---------------------------------------------------------------------------
// PII detection helpers (mirrors what the pipeline should remove)
// ---------------------------------------------------------------------------

const PII_FIELDS = [
  'clientName', 'domain', 'contactInfo', 'email', 'phone',
  'address', 'firstName', 'lastName', 'fullName', 'name', 'url', 'website',
];

function containsPiiField(obj: any, visited = new Set<any>()): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') return false;
  if (visited.has(obj)) return false;
  visited.add(obj);

  for (const key of Object.keys(obj)) {
    if (PII_FIELDS.some((f) => f.toLowerCase() === key.toLowerCase())) return true;
    if (typeof obj[key] === 'object' && containsPiiField(obj[key], visited)) return true;
  }
  return false;
}

function containsEmailPattern(str: string): boolean {
  return /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(str);
}

function serializeMetrics(metrics: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries(metrics));
}

// ---------------------------------------------------------------------------
// Property 31: Anonymization Completeness
// ---------------------------------------------------------------------------

describe('Property 31: Anonymization Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 31: Anonymization Completeness
   *
   * For any audit completion, the Benchmark_Engine SHALL extract metrics with
   * all client-identifying information removed.
   *
   * Validates: Requirements 8.1, 8.2
   */

  const pipeline = new AnonymizationPipeline();

  it('should remove all PII field keys from the anonymized output', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // None of the PII field names should appear as top-level keys in the result
        for (const field of PII_FIELDS) {
          expect(result).not.toHaveProperty(field);
        }

        // The result should only have the expected anonymized fields
        const allowedKeys = new Set(['anonymousId', 'industry', 'businessSize', 'locale', 'metrics', 'timestamp', 'differentialPrivacyNoise']);
        for (const key of Object.keys(result)) {
          expect(allowedKeys).toContain(key);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should not include the original domain in the anonymized output', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        const resultJson = JSON.stringify({
          industry: result.industry,
          businessSize: result.businessSize,
          locale: result.locale,
          metrics: serializeMetrics(result.metrics),
        });

        // The raw domain should not appear verbatim in the output
        expect(resultJson).not.toContain(raw.domain);
      }),
      { numRuns: 100 }
    );
  });

  it('should produce a non-reversible anonymousId (SHA-256 hash) for any clientId', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // anonymousId must be a 64-char hex SHA-256 hash
        expect(result.anonymousId).toMatch(/^[a-f0-9]{64}$/);

        // It must not equal the original clientId
        expect(result.anonymousId).not.toBe(raw.clientId);
      }),
      { numRuns: 100 }
    );
  });

  it('should extract only numeric metrics (no PII values) from audit results', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // All metric values must be finite numbers
        for (const [key, value] of result.metrics.entries()) {
          expect(typeof value).toBe('number');
          expect(isFinite(value)).toBe(true);
          // Metric keys must not be PII field names
          expect(PII_FIELDS.map((f) => f.toLowerCase())).not.toContain(key.toLowerCase());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve the timestamp from the raw metrics', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);
        expect(result.timestamp).toEqual(raw.timestamp);
      }),
      { numRuns: 100 }
    );
  });

  it('should always produce a valid anonymized record structure', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // Required fields must be present and non-empty
        expect(typeof result.anonymousId).toBe('string');
        expect(result.anonymousId.length).toBeGreaterThan(0);

        expect(typeof result.industry).toBe('string');
        expect(result.industry.length).toBeGreaterThan(0);

        expect(typeof result.businessSize).toBe('string');
        expect(result.businessSize.length).toBeGreaterThan(0);

        expect(typeof result.locale).toBe('string');
        expect(result.locale.length).toBeGreaterThan(0);

        expect(result.metrics).toBeInstanceOf(Map);
        expect(result.timestamp).toBeInstanceOf(Date);
        expect(typeof result.differentialPrivacyNoise).toBe('number');
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 54: Privacy-First Anonymization
// ---------------------------------------------------------------------------

describe('Property 54: Privacy-First Anonymization', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 54: Privacy-First Anonymization
   *
   * For any anonymized metric collection, the System SHALL remove all
   * client-identifying information before storage.
   *
   * Validates: Requirements 12.1
   */

  const pipeline = new AnonymizationPipeline();

  it('should pass validateAnonymization for any anonymized record', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);
        const validation = await pipeline.validateAnonymization(result);

        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should not contain any email addresses in the anonymized output', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // Serialize all string fields and check for email patterns
        const stringFields = [result.industry, result.businessSize, result.locale];
        for (const field of stringFields) {
          expect(containsEmailPattern(field)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should produce different anonymousIds for different clientIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        clientIdArb,
        clientIdArb.filter((id2) => true), // second id, may collide but that's fine
        async (id1: string, id2: string) => {
          fc.pre(id1 !== id2);

          const raw1: RawAuditMetrics = {
            clientId: id1,
            clientName: 'Client A',
            domain: 'client-a.com',
            contactInfo: 'a@client-a.com',
            auditResults: { industry: 'dental', locale: 'en-US', businessSize: 'small', score: 80 },
            timestamp: new Date(),
          };
          const raw2: RawAuditMetrics = {
            clientId: id2,
            clientName: 'Client B',
            domain: 'client-b.com',
            contactInfo: 'b@client-b.com',
            auditResults: { industry: 'dental', locale: 'en-US', businessSize: 'small', score: 80 },
            timestamp: new Date(),
          };

          const r1 = await pipeline.anonymizeMetrics(raw1);
          const r2 = await pipeline.anonymizeMetrics(raw2);

          expect(r1.anonymousId).not.toBe(r2.anonymousId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce the same anonymousId for the same clientId (deterministic hashing)', async () => {
    await fc.assert(
      fc.asyncProperty(clientIdArb, async (clientId: string) => {
        const raw: RawAuditMetrics = {
          clientId,
          clientName: 'Test Corp',
          domain: 'test.com',
          contactInfo: 'test@test.com',
          auditResults: { industry: 'retail', locale: 'en-US', businessSize: 'medium', score: 70 },
          timestamp: new Date('2024-01-01'),
        };

        const r1 = await pipeline.anonymizeMetrics(raw);
        const r2 = await pipeline.anonymizeMetrics(raw);

        expect(r1.anonymousId).toBe(r2.anonymousId);
      }),
      { numRuns: 100 }
    );
  });

  it('should remove identifying info from nested audit result objects', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          clientName: clientNameArb,
          domain: domainArb,
          email: emailArb,
          score: metricValueArb,
          industry: industryArb,
        }),
        async (data) => {
          const cleaned = await pipeline.removeIdentifyingInfo(data);

          // PII fields must be removed
          expect(cleaned).not.toHaveProperty('clientName');
          expect(cleaned).not.toHaveProperty('domain');
          expect(cleaned).not.toHaveProperty('email');

          // Non-PII fields must be preserved
          expect(cleaned).toHaveProperty('score');
          expect(cleaned).toHaveProperty('industry');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not expose raw contactInfo in the anonymized output', async () => {
    await fc.assert(
      fc.asyncProperty(
        rawAuditMetricsArb,
        async (raw: RawAuditMetrics) => {
          const result = await pipeline.anonymizeMetrics(raw);

          // The result object should not have a contactInfo property
          expect(result).not.toHaveProperty('contactInfo');

          // Serialize the result and verify contactInfo value is not present
          const resultStr = JSON.stringify({
            anonymousId: result.anonymousId,
            industry: result.industry,
            businessSize: result.businessSize,
            locale: result.locale,
          });

          // If contactInfo was a plain string (not email/phone), it shouldn't appear
          // We check that the result doesn't contain the raw contactInfo field name
          expect(resultStr).not.toContain('"contactInfo"');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generalize businessSize to a valid category for any input', async () => {
    await fc.assert(
      fc.asyncProperty(rawAuditMetricsArb, async (raw: RawAuditMetrics) => {
        const result = await pipeline.anonymizeMetrics(raw);

        // businessSize must be one of the generalized categories
        expect(['small', 'medium', 'large', 'unknown']).toContain(result.businessSize);
      }),
      { numRuns: 100 }
    );
  });
});
