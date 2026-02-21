// Feature: agentic-delivery-qa-hardening, Property 4: Implementation package completeness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { packageArtifact } from '../packager';
import { ValidatedArtifact } from '../validationPipeline';
import { Finding } from '@prisma/client';

describe('Property 4: Implementation package completeness', () => {
  it('should return package with all four required fields non-null and non-empty', async () => {
    const mockArtifact: ValidatedArtifact = {
      content: JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness' }),
      artifactType: 'json_ld',
      metadata: {
        findingId: 'test-finding-1',
        generatedAt: new Date(),
        category: 'SCHEMA',
      },
      status: 'VALIDATED',
      validationResults: [],
    };

    const mockFinding: Finding = {
      id: 'test-finding-1',
      auditId: 'test-audit-1',
      module: 'test-module',
      category: 'SCHEMA',
      type: 'PAINKILLER',
      title: 'Test Finding',
      description: 'Test description',
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

    const pkg = await packageArtifact(mockArtifact, mockFinding);

    // Check all four required fields
    expect(pkg.artifactContent).toBeDefined();
    expect(pkg.artifactContent).not.toBeNull();
    expect(typeof pkg.artifactContent).toBe('string');
    expect(pkg.artifactContent.length).toBeGreaterThan(0);

    expect(pkg.installationInstructions).toBeDefined();
    expect(pkg.installationInstructions).not.toBeNull();
    expect(typeof pkg.installationInstructions).toBe('string');
    expect(pkg.installationInstructions.length).toBeGreaterThan(0);

    expect(pkg.estimatedImpact).toBeDefined();
    expect(pkg.estimatedImpact).not.toBeNull();
    expect(typeof pkg.estimatedImpact).toBe('string');
    expect(pkg.estimatedImpact.length).toBeGreaterThan(0);

    // Before/after preview should be present
    expect(pkg.beforePreview).toBeDefined();
    expect(pkg.beforePreview).not.toBeNull();
    expect(typeof pkg.beforePreview).toBe('string');
    expect(pkg.beforePreview.length).toBeGreaterThan(0);
  });

  it('should have correct artifact type in package', async () => {
    const artifactTypes = ['json_ld', 'html_meta', 'speed_script', 'gbp_draft', 'content_brief', 'aria_fix'];

    for (const artifactType of artifactTypes) {
      const mockArtifact: ValidatedArtifact = {
        content: 'test content',
        artifactType,
        metadata: {
          findingId: 'test-finding-1',
          generatedAt: new Date(),
          category: 'TEST',
        },
        status: 'VALIDATED',
        validationResults: [],
      };

      const mockFinding: Finding = {
        id: 'test-finding-1',
        auditId: 'test-audit-1',
        module: 'test-module',
        category: 'TEST',
        type: 'PAINKILLER',
        title: 'Test Finding',
        description: 'Test description',
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

      const pkg = await packageArtifact(mockArtifact, mockFinding);

      expect(pkg.artifactType).toBe(artifactType);
    }
  });

  it('should assign correct impact label based on impact score', async () => {
    const testCases = [
      { score: 90, expectedLabel: 'High Impact' },
      { score: 80, expectedLabel: 'High Impact' },
      { score: 75, expectedLabel: 'Medium Impact' },
      { score: 50, expectedLabel: 'Medium Impact' },
      { score: 49, expectedLabel: 'Low Impact' },
      { score: 10, expectedLabel: 'Low Impact' },
    ];

    for (const { score, expectedLabel } of testCases) {
      const mockArtifact: ValidatedArtifact = {
        content: 'test content',
        artifactType: 'json_ld',
        metadata: {
          findingId: 'test-finding-1',
          generatedAt: new Date(),
          category: 'TEST',
        },
        status: 'VALIDATED',
        validationResults: [],
      };

      const mockFinding: Finding = {
        id: 'test-finding-1',
        auditId: 'test-audit-1',
        module: 'test-module',
        category: 'TEST',
        type: 'PAINKILLER',
        title: 'Test Finding',
        description: 'Test description',
        evidence: [],
        metrics: {},
        impactScore: score,
        confidenceScore: 80,
        effortEstimate: 'MEDIUM',
        recommendedFix: [],
        manuallyEdited: false,
        excluded: false,
        confidenceLevel: 'HIGH',
        tenantId: 'test-tenant',
        createdAt: new Date(),
      };

      const pkg = await packageArtifact(mockArtifact, mockFinding);

      expect(pkg.estimatedImpact).toBe(expectedLabel);
    }
  });

  it('should include finding and artifact IDs in package', async () => {
    const mockArtifact: ValidatedArtifact = {
      content: 'test content',
      artifactType: 'json_ld',
      metadata: {
        findingId: 'finding-123',
        generatedAt: new Date(),
        category: 'TEST',
      },
      status: 'VALIDATED',
      validationResults: [],
    };

    const mockFinding: Finding = {
      id: 'finding-123',
      auditId: 'test-audit-1',
      module: 'test-module',
      category: 'TEST',
      type: 'PAINKILLER',
      title: 'Test Finding',
      description: 'Test description',
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

    const pkg = await packageArtifact(mockArtifact, mockFinding);

    expect(pkg.findingId).toBe('finding-123');
    expect(pkg.artifactId).toBe('finding-123');
  });
});
