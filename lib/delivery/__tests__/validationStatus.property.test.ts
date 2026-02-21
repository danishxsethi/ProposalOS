// Feature: agentic-delivery-qa-hardening, Property 2: Validation status completeness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runValidationPipeline } from '../validationPipeline';
import { RawArtifact } from '../generators';

describe('Property 2: Validation status completeness', () => {
  it('should always assign VALIDATED or FAILED_VALIDATION status', async () => {
    const artifactArbitrary = fc.record({
      content: fc.string({ minLength: 1 }),
      artifactType: fc.constantFrom('json_ld', 'html_meta', 'speed_script', 'gbp_draft', 'content_brief', 'aria_fix'),
      metadata: fc.record({
        findingId: fc.uuid(),
        generatedAt: fc.date(),
        category: fc.string(),
      }),
    });

    await fc.assert(
      fc.asyncProperty(artifactArbitrary, async (artifact) => {
        const result = await runValidationPipeline(artifact as RawArtifact);

        // Must be exactly one of the two statuses
        expect(['VALIDATED', 'FAILED_VALIDATION']).toContain(result.status);

        // Must never be null or undefined
        expect(result.status).toBeDefined();
        expect(result.status).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should mark valid JSON-LD as VALIDATED', async () => {
    const validJsonLd: RawArtifact = {
      content: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'Test Business',
      }),
      artifactType: 'json_ld',
      metadata: {
        findingId: 'test-1',
        generatedAt: new Date(),
        category: 'SCHEMA',
      },
    };

    const result = await runValidationPipeline(validJsonLd);
    expect(result.status).toBe('VALIDATED');
  });

  it('should mark invalid JSON-LD as FAILED_VALIDATION', async () => {
    const invalidJsonLd: RawArtifact = {
      content: '{ invalid json }',
      artifactType: 'json_ld',
      metadata: {
        findingId: 'test-1',
        generatedAt: new Date(),
        category: 'SCHEMA',
      },
    };

    const result = await runValidationPipeline(invalidJsonLd);
    expect(result.status).toBe('FAILED_VALIDATION');
  });

  it('should mark valid HTML as VALIDATED', async () => {
    const validHtml: RawArtifact = {
      content: '<meta name="description" content="Test description">',
      artifactType: 'html_meta',
      metadata: {
        findingId: 'test-1',
        generatedAt: new Date(),
        category: 'SEO',
      },
    };

    const result = await runValidationPipeline(validHtml);
    expect(result.status).toBe('VALIDATED');
  });

  it('should include validation results array', async () => {
    const artifact: RawArtifact = {
      content: JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness' }),
      artifactType: 'json_ld',
      metadata: {
        findingId: 'test-1',
        generatedAt: new Date(),
        category: 'SCHEMA',
      },
    };

    const result = await runValidationPipeline(artifact);
    expect(result.validationResults).toBeDefined();
    expect(Array.isArray(result.validationResults)).toBe(true);
    expect(result.validationResults.length).toBeGreaterThan(0);
  });

  it('should have validation results with correct structure', async () => {
    const artifact: RawArtifact = {
      content: JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness' }),
      artifactType: 'json_ld',
      metadata: {
        findingId: 'test-1',
        generatedAt: new Date(),
        category: 'SCHEMA',
      },
    };

    const result = await runValidationPipeline(artifact);
    
    result.validationResults.forEach((checkResult) => {
      expect(checkResult.checkName).toBeDefined();
      expect(['syntax', 'schema', 'lighthouse', 'human_review']).toContain(checkResult.checkName);
      expect(typeof checkResult.passed).toBe('boolean');
      expect(typeof checkResult.details).toBe('string');
    });
  });
});
