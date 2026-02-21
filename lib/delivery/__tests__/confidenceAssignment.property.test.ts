// Feature: agentic-delivery-qa-hardening, Property 7: Confidence score assignment completeness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scoreConfidence, ConfidenceLevel } from '../confidenceScorer';
import { Finding } from '@prisma/client';

describe('Property 7: Confidence score assignment completeness', () => {
  it('should always assign exactly one of HIGH, MEDIUM, LOW confidence levels', () => {
    const findingArbitrary = fc.record({
      id: fc.uuid(),
      auditId: fc.uuid(),
      module: fc.string(),
      category: fc.string(),
      type: fc.constantFrom('PAINKILLER', 'VITAMIN', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON'),
      title: fc.string(),
      description: fc.option(fc.string()),
      evidence: fc.array(
        fc.record({
          pointer: fc.option(fc.string()),
          collected_at: fc.option(fc.date()),
          source: fc.option(fc.string()),
        })
      ),
      metrics: fc.record({ key: fc.string() }, { minKeys: 0, maxKeys: 5 }),
      impactScore: fc.integer({ min: 0, max: 100 }),
      confidenceScore: fc.integer({ min: 0, max: 100 }),
      effortEstimate: fc.option(fc.constantFrom('LOW', 'MEDIUM', 'HIGH')),
      recommendedFix: fc.array(fc.string()),
      manuallyEdited: fc.boolean(),
      excluded: fc.boolean(),
      confidenceLevel: fc.option(fc.constantFrom('HIGH', 'MEDIUM', 'LOW')),
      tenantId: fc.option(fc.uuid()),
      createdAt: fc.date(),
    });

    fc.assert(
      fc.property(findingArbitrary, (finding) => {
        const result = scoreConfidence(finding as Finding);
        
        // Must be exactly one of the three levels
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result);
        
        // Must never be null or undefined
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should assign HIGH confidence when evidence has direct measurement with pointer and timestamp', () => {
    const findingWithDirectMeasurement = fc.record({
      id: fc.uuid(),
      auditId: fc.uuid(),
      module: fc.string(),
      category: fc.string(),
      type: fc.constantFrom('PAINKILLER', 'VITAMIN', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON'),
      title: fc.string(),
      description: fc.option(fc.string()),
      evidence: fc.array(
        fc.record({
          pointer: fc.string({ minLength: 1 }), // Ensure non-empty
          collected_at: fc.date(), // Always present
          source: fc.option(fc.string()),
        }),
        { minLength: 1 }
      ),
      metrics: fc.record({ key: fc.string() }, { minKeys: 0, maxKeys: 5 }),
      impactScore: fc.integer({ min: 0, max: 100 }),
      confidenceScore: fc.integer({ min: 0, max: 100 }),
      effortEstimate: fc.option(fc.constantFrom('LOW', 'MEDIUM', 'HIGH')),
      recommendedFix: fc.array(fc.string()),
      manuallyEdited: fc.boolean(),
      excluded: fc.boolean(),
      confidenceLevel: fc.option(fc.constantFrom('HIGH', 'MEDIUM', 'LOW')),
      tenantId: fc.option(fc.uuid()),
      createdAt: fc.date(),
    });

    fc.assert(
      fc.property(findingWithDirectMeasurement, (finding) => {
        const result = scoreConfidence(finding as Finding);
        expect(result).toBe('HIGH');
      }),
      { numRuns: 100 }
    );
  });

  it('should assign MEDIUM confidence when evidence is non-empty but lacks direct measurement', () => {
    const findingWithIndirectEvidence = fc.record({
      id: fc.uuid(),
      auditId: fc.uuid(),
      module: fc.string(),
      category: fc.string(),
      type: fc.constantFrom('PAINKILLER', 'VITAMIN', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON'),
      title: fc.string(),
      description: fc.option(fc.string()),
      evidence: fc.array(
        fc.record({
          pointer: fc.option(fc.constant(null)), // No pointer
          collected_at: fc.option(fc.constant(null)), // No timestamp
          source: fc.string(),
        }),
        { minLength: 1 }
      ),
      metrics: fc.record({ key: fc.string() }, { minKeys: 0, maxKeys: 5 }),
      impactScore: fc.integer({ min: 0, max: 100 }),
      confidenceScore: fc.integer({ min: 0, max: 100 }),
      effortEstimate: fc.option(fc.constantFrom('LOW', 'MEDIUM', 'HIGH')),
      recommendedFix: fc.array(fc.string()),
      manuallyEdited: fc.boolean(),
      excluded: fc.boolean(),
      confidenceLevel: fc.option(fc.constantFrom('HIGH', 'MEDIUM', 'LOW')),
      tenantId: fc.option(fc.uuid()),
      createdAt: fc.date(),
    });

    fc.assert(
      fc.property(findingWithIndirectEvidence, (finding) => {
        const result = scoreConfidence(finding as Finding);
        expect(result).toBe('MEDIUM');
      }),
      { numRuns: 100 }
    );
  });

  it('should assign LOW confidence when evidence is empty', () => {
    const findingWithoutEvidence = fc.record({
      id: fc.uuid(),
      auditId: fc.uuid(),
      module: fc.string(),
      category: fc.string(),
      type: fc.constantFrom('PAINKILLER', 'VITAMIN', 'VISUAL_UX', 'VISUAL_DESIGN', 'VISUAL_COMPARISON'),
      title: fc.string(),
      description: fc.option(fc.string()),
      evidence: fc.constant([]), // Empty evidence
      metrics: fc.record({ key: fc.string() }, { minKeys: 0, maxKeys: 5 }),
      impactScore: fc.integer({ min: 0, max: 100 }),
      confidenceScore: fc.integer({ min: 0, max: 100 }),
      effortEstimate: fc.option(fc.constantFrom('LOW', 'MEDIUM', 'HIGH')),
      recommendedFix: fc.array(fc.string()),
      manuallyEdited: fc.boolean(),
      excluded: fc.boolean(),
      confidenceLevel: fc.option(fc.constantFrom('HIGH', 'MEDIUM', 'LOW')),
      tenantId: fc.option(fc.uuid()),
      createdAt: fc.date(),
    });

    fc.assert(
      fc.property(findingWithoutEvidence, (finding) => {
        const result = scoreConfidence(finding as Finding);
        expect(result).toBe('LOW');
      }),
      { numRuns: 100 }
    );
  });
});
