/**
 * Unit tests for AnonymizationPipeline
 * Requirements: 8.1, 8.2, 12.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnonymizationPipeline } from '../anonymization-pipeline';
import { RawAuditMetrics, AnonymizedAuditMetrics } from '../types';

function makeRawMetrics(overrides: Partial<RawAuditMetrics> = {}): RawAuditMetrics {
  return {
    clientId: 'client-abc-123',
    clientName: 'Acme Corp',
    domain: 'acme.com',
    contactInfo: 'John Doe, john@acme.com, +1-555-123-4567',
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

describe('AnonymizationPipeline', () => {
  let pipeline: AnonymizationPipeline;

  beforeEach(() => {
    pipeline = new AnonymizationPipeline();
  });

  // --------------------------------------------------------------------------
  // anonymizeMetrics
  // --------------------------------------------------------------------------

  describe('anonymizeMetrics', () => {
    it('should return an AnonymizedAuditMetrics object', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(result).toBeDefined();
      expect(result.anonymousId).toBeDefined();
      expect(result.industry).toBeDefined();
      expect(result.businessSize).toBeDefined();
      expect(result.locale).toBeDefined();
      expect(result.metrics).toBeInstanceOf(Map);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should produce a SHA-256 hex hash for anonymousId', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(result.anonymousId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce the same anonymousId for the same clientId (deterministic)', async () => {
      const r1 = await pipeline.anonymizeMetrics(makeRawMetrics({ clientId: 'same-client' }));
      const r2 = await pipeline.anonymizeMetrics(makeRawMetrics({ clientId: 'same-client' }));
      expect(r1.anonymousId).toBe(r2.anonymousId);
    });

    it('should produce different anonymousIds for different clientIds', async () => {
      const r1 = await pipeline.anonymizeMetrics(makeRawMetrics({ clientId: 'client-A' }));
      const r2 = await pipeline.anonymizeMetrics(makeRawMetrics({ clientId: 'client-B' }));
      expect(r1.anonymousId).not.toBe(r2.anonymousId);
    });

    it('should extract industry from auditResults', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(result.industry).toBe('dental');
    });

    it('should extract locale from auditResults', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(result.locale).toBe('en-US');
    });

    it('should generalize businessSize to category', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(['small', 'medium', 'large', 'unknown']).toContain(result.businessSize);
    });

    it('should preserve the original timestamp', async () => {
      const ts = new Date('2024-06-01T12:00:00Z');
      const result = await pipeline.anonymizeMetrics(makeRawMetrics({ timestamp: ts }));
      expect(result.timestamp).toEqual(ts);
    });

    it('should extract numeric metrics from auditResults', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      expect(result.metrics.size).toBeGreaterThan(0);
      for (const [, v] of result.metrics) {
        expect(typeof v).toBe('number');
      }
    });

    it('should not include clientName in output', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      const json = JSON.stringify(result);
      expect(json).not.toContain('Acme Corp');
    });

    it('should not include domain in output', async () => {
      const result = await pipeline.anonymizeMetrics(makeRawMetrics());
      const json = JSON.stringify(result);
      expect(json).not.toContain('acme.com');
    });

    it('should handle missing auditResults gracefully', async () => {
      const raw = makeRawMetrics({ auditResults: null });
      const result = await pipeline.anonymizeMetrics(raw);
      expect(result.anonymousId).toMatch(/^[a-f0-9]{64}$/);
      expect(result.industry).toBe('unknown');
    });
  });

  // --------------------------------------------------------------------------
  // removeIdentifyingInfo
  // --------------------------------------------------------------------------

  describe('removeIdentifyingInfo', () => {
    it('should remove clientName field', async () => {
      const data = { clientName: 'Acme Corp', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('clientName');
      expect(result.score).toBe(80);
    });

    it('should remove domain field', async () => {
      const data = { domain: 'example.com', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('domain');
    });

    it('should remove contactInfo field', async () => {
      const data = { contactInfo: 'Jane Doe, jane@example.com', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('contactInfo');
    });

    it('should remove email field', async () => {
      const data = { email: 'user@example.com', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('email');
    });

    it('should remove phone field', async () => {
      const data = { phone: '+1-555-123-4567', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('phone');
    });

    it('should remove name field', async () => {
      const data = { name: 'John Smith', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('name');
    });

    it('should preserve non-identifying fields', async () => {
      const data = { industry: 'dental', score: 90, locale: 'en-US' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.industry).toBe('dental');
      expect(result.score).toBe(90);
      expect(result.locale).toBe('en-US');
    });

    it('should scrub email addresses embedded in string values', async () => {
      const data = { notes: 'Contact us at admin@company.com for details' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.notes).not.toContain('admin@company.com');
      expect(result.notes).toContain('[REDACTED_EMAIL]');
    });

    it('should handle null input', async () => {
      const result = await pipeline.removeIdentifyingInfo(null);
      expect(result).toBeNull();
    });

    it('should handle undefined input', async () => {
      const result = await pipeline.removeIdentifyingInfo(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle nested objects recursively', async () => {
      const data = {
        audit: {
          clientName: 'Hidden Corp',
          score: 75,
        },
      };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.audit).not.toHaveProperty('clientName');
      expect(result.audit.score).toBe(75);
    });

    it('should handle arrays', async () => {
      const data = [
        { clientName: 'Corp A', score: 80 },
        { clientName: 'Corp B', score: 90 },
      ];
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).not.toHaveProperty('clientName');
      expect(result[0].score).toBe(80);
      expect(result[1]).not.toHaveProperty('clientName');
    });

    it('should generalize location to region', async () => {
      const data = { location: 'DE', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      // location should be generalized to region
      expect(result).not.toHaveProperty('location');
      expect(result.region).toBeDefined();
    });

    it('should generalize businessSize to sizeCategory', async () => {
      const data = { businessSize: 'small', score: 80 };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result).not.toHaveProperty('businessSize');
      expect(result.sizeCategory).toBeDefined();
      expect(['small', 'medium', 'large', 'unknown']).toContain(result.sizeCategory);
    });
  });

  // --------------------------------------------------------------------------
  // Field generalization
  // --------------------------------------------------------------------------

  describe('field generalization', () => {
    it('should map "small" businessSize to "small" category', async () => {
      const data = { businessSize: 'small' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.sizeCategory).toBe('small');
    });

    it('should map "medium" businessSize to "medium" category', async () => {
      const data = { businessSize: 'medium' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.sizeCategory).toBe('medium');
    });

    it('should map "large" businessSize to "large" category', async () => {
      const data = { businessSize: 'large' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.sizeCategory).toBe('large');
    });

    it('should map numeric employee count to size category', async () => {
      const data = { businessSize: '5' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.sizeCategory).toBe('small');
    });

    it('should map location country code to region', async () => {
      const data = { location: 'DE' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.region).toBe('europe');
    });

    it('should map unknown location to "other"', async () => {
      const data = { location: 'ZZ' };
      const result = await pipeline.removeIdentifyingInfo(data);
      expect(result.region).toBe('other');
    });
  });

  // --------------------------------------------------------------------------
  // One-way hashing
  // --------------------------------------------------------------------------

  describe('one-way hashing of client ID', () => {
    it('should not be reversible (hash is not the original ID)', async () => {
      const raw = makeRawMetrics({ clientId: 'secret-client-id' });
      const result = await pipeline.anonymizeMetrics(raw);
      expect(result.anonymousId).not.toBe('secret-client-id');
    });

    it('should produce consistent hash across calls', async () => {
      const raw = makeRawMetrics({ clientId: 'consistent-id' });
      const r1 = await pipeline.anonymizeMetrics(raw);
      const r2 = await pipeline.anonymizeMetrics(raw);
      expect(r1.anonymousId).toBe(r2.anonymousId);
    });

    it('should produce a 64-character hex string', async () => {
      const raw = makeRawMetrics({ clientId: 'any-client' });
      const result = await pipeline.anonymizeMetrics(raw);
      expect(result.anonymousId).toHaveLength(64);
      expect(result.anonymousId).toMatch(/^[a-f0-9]+$/);
    });
  });

  // --------------------------------------------------------------------------
  // validateAnonymization
  // --------------------------------------------------------------------------

  describe('validateAnonymization', () => {
    it('should return valid for a properly anonymized record', async () => {
      const raw = makeRawMetrics();
      const anonymized = await pipeline.anonymizeMetrics(raw);
      const validation = await pipeline.validateAnonymization(anonymized);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should return invalid when anonymousId is not a SHA-256 hash', async () => {
      const anonymized: AnonymizedAuditMetrics = {
        anonymousId: 'not-a-hash',
        industry: 'dental',
        businessSize: 'small',
        locale: 'en-US',
        metrics: new Map([['score', 80]]),
        timestamp: new Date(),
        differentialPrivacyNoise: 0,
      };
      const validation = await pipeline.validateAnonymization(anonymized);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // auditAnonymization
  // --------------------------------------------------------------------------

  describe('auditAnonymization', () => {
    it('should return an audit log with timestamp and operation', async () => {
      const raw = makeRawMetrics();
      const anonymized = await pipeline.anonymizeMetrics(raw);
      const log = await pipeline.auditAnonymization(anonymized);
      expect(log.timestamp).toBeInstanceOf(Date);
      expect(log.operation).toBe('anonymize_metrics');
      expect(log.details).toBeDefined();
    });

    it('should include anonymousId in audit log details', async () => {
      const raw = makeRawMetrics();
      const anonymized = await pipeline.anonymizeMetrics(raw);
      const log = await pipeline.auditAnonymization(anonymized);
      expect(log.details.anonymousId).toBe(anonymized.anonymousId);
    });

    it('should include metric count in audit log details', async () => {
      const raw = makeRawMetrics();
      const anonymized = await pipeline.anonymizeMetrics(raw);
      const log = await pipeline.auditAnonymization(anonymized);
      expect(typeof log.details.metricCount).toBe('number');
    });
  });
});
