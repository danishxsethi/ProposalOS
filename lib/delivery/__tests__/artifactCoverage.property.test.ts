// Feature: agentic-delivery-qa-hardening, Property 1: Artifact type coverage
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getGenerator, getSupportedCategories } from '../generators';
import { Finding } from '@prisma/client';

describe('Property 1: Artifact type coverage', () => {
  it('should have generators for all required categories', () => {
    const requiredCategories = ['SCHEMA', 'SEO', 'SPEED', 'GBP', 'CONTENT', 'ACCESSIBILITY'];
    const supportedCategories = getSupportedCategories();

    requiredCategories.forEach((category) => {
      expect(supportedCategories).toContain(category);
    });
  });

  it('should return non-null generator for each required category', () => {
    const requiredCategories = ['SCHEMA', 'SEO', 'SPEED', 'GBP', 'CONTENT', 'ACCESSIBILITY'];

    requiredCategories.forEach((category) => {
      const generator = getGenerator(category);
      expect(generator).toBeDefined();
      expect(generator).not.toBeNull();
    });
  });

  it('should generate artifact with correct type for each category', async () => {
    const categoryToExpectedType: Record<string, string> = {
      SCHEMA: 'json_ld',
      SEO: 'html_meta',
      SPEED: 'speed_script',
      PERFORMANCE: 'speed_script',
      GBP: 'gbp_draft',
      CONTENT: 'content_brief',
      ACCESSIBILITY: 'aria_fix',
    };

    for (const [category, expectedType] of Object.entries(categoryToExpectedType)) {
      const generator = getGenerator(category);
      expect(generator).toBeDefined();

      if (generator) {
        const mockFinding: Finding = {
          id: 'test-finding-1',
          auditId: 'test-audit-1',
          module: 'test-module',
          category,
          type: 'PAINKILLER',
          title: `Test ${category} Finding`,
          description: `This is a test finding for ${category}`,
          evidence: [],
          metrics: {},
          impactScore: 75,
          confidenceScore: 80,
          effortEstimate: 'MEDIUM',
          recommendedFix: [],
          manuallyEdited: false,
          excluded: false,
          confidenceLevel: 'HIGH',
          tenantId: 'test-tenant',
          createdAt: new Date(),
        };

        const context = {
          businessName: 'Test Business',
          businessUrl: 'https://example.com',
          businessCity: 'Test City',
        };

        const artifact = await generator.generate(mockFinding, context);

        expect(artifact).toBeDefined();
        expect(artifact.artifactType).toBe(expectedType);
        expect(artifact.content).toBeDefined();
        expect(artifact.content.length).toBeGreaterThan(0);
        expect(artifact.metadata.findingId).toBe(mockFinding.id);
      }
    }
  });

  it('should generate non-empty content for all categories', async () => {
    const categories = ['SCHEMA', 'SEO', 'SPEED', 'GBP', 'CONTENT', 'ACCESSIBILITY'];

    for (const category of categories) {
      const generator = getGenerator(category);
      expect(generator).toBeDefined();

      if (generator) {
        const mockFinding: Finding = {
          id: `test-finding-${category}`,
          auditId: 'test-audit-1',
          module: 'test-module',
          category,
          type: 'PAINKILLER',
          title: `Test ${category} Finding`,
          description: `This is a test finding for ${category}`,
          evidence: [],
          metrics: {},
          impactScore: 75,
          confidenceScore: 80,
          effortEstimate: 'MEDIUM',
          recommendedFix: [],
          manuallyEdited: false,
          excluded: false,
          confidenceLevel: 'HIGH',
          tenantId: 'test-tenant',
          createdAt: new Date(),
        };

        const context = {
          businessName: 'Test Business',
          businessUrl: 'https://example.com',
          businessCity: 'Test City',
        };

        const artifact = await generator.generate(mockFinding, context);

        expect(artifact.content).toBeDefined();
        expect(artifact.content.length).toBeGreaterThan(0);
        expect(typeof artifact.content).toBe('string');
      }
    }
  });

  it('should return undefined for unsupported categories', () => {
    const unsupportedCategories = ['UNKNOWN', 'INVALID', 'FAKE_CATEGORY'];

    unsupportedCategories.forEach((category) => {
      const generator = getGenerator(category);
      expect(generator).toBeUndefined();
    });
  });

  it('should have correct artifact type from generator.getArtifactType()', () => {
    const categoryToExpectedType: Record<string, string> = {
      SCHEMA: 'json_ld',
      SEO: 'html_meta',
      SPEED: 'speed_script',
      GBP: 'gbp_draft',
      CONTENT: 'content_brief',
      ACCESSIBILITY: 'aria_fix',
    };

    for (const [category, expectedType] of Object.entries(categoryToExpectedType)) {
      const generator = getGenerator(category);
      expect(generator).toBeDefined();

      if (generator) {
        expect(generator.getArtifactType()).toBe(expectedType);
      }
    }
  });
});
