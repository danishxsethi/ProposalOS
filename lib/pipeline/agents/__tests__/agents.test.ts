import { describe, it, expect } from 'vitest';
import {
  speedOptimizationAgent,
  seoFixAgent,
  accessibilityAgent,
  securityHardeningAgent,
  contentGenerationAgent,
  getAgent,
  getAgentForCategory,
} from '../index';
import type { AgentContext } from '../baseAgent';

describe('AI Service Agents', () => {
  const mockContext: AgentContext = {
    findingId: 'finding-123',
    findingTitle: 'Test Finding',
    findingDescription: 'Test description',
    evidence: [],
    metrics: { pageLoadTime: 5000 },
    websiteUrl: 'https://example.com',
    tenantId: 'tenant-123',
  };

  describe('Speed Optimization Agent', () => {
    it('should have correct type', () => {
      expect(speedOptimizationAgent.getType()).toBe('speed_optimization');
    });

    it('should handle SPEED and PERFORMANCE categories', () => {
      expect(speedOptimizationAgent.canHandle('SPEED')).toBe(true);
      expect(speedOptimizationAgent.canHandle('PERFORMANCE')).toBe(true);
      expect(speedOptimizationAgent.canHandle('SEO')).toBe(false);
    });

    it('should execute successfully', async () => {
      const result = await speedOptimizationAgent.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.changes).toBeInstanceOf(Array);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('SEO Fix Agent', () => {
    it('should have correct type', () => {
      expect(seoFixAgent.getType()).toBe('seo_fix');
    });

    it('should handle SEO category', () => {
      expect(seoFixAgent.canHandle('SEO')).toBe(true);
      expect(seoFixAgent.canHandle('SPEED')).toBe(false);
    });

    it('should execute successfully', async () => {
      const result = await seoFixAgent.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.changes).toBeInstanceOf(Array);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('Accessibility Agent', () => {
    it('should have correct type', () => {
      expect(accessibilityAgent.getType()).toBe('accessibility');
    });

    it('should handle ACCESSIBILITY category', () => {
      expect(accessibilityAgent.canHandle('ACCESSIBILITY')).toBe(true);
      expect(accessibilityAgent.canHandle('SECURITY')).toBe(false);
    });

    it('should execute successfully', async () => {
      const result = await accessibilityAgent.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.changes).toBeInstanceOf(Array);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('Security Hardening Agent', () => {
    it('should have correct type', () => {
      expect(securityHardeningAgent.getType()).toBe('security_hardening');
    });

    it('should handle SECURITY category', () => {
      expect(securityHardeningAgent.canHandle('SECURITY')).toBe(true);
      expect(securityHardeningAgent.canHandle('CONTENT')).toBe(false);
    });

    it('should execute successfully', async () => {
      const result = await securityHardeningAgent.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.changes).toBeInstanceOf(Array);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('Content Generation Agent', () => {
    it('should have correct type', () => {
      expect(contentGenerationAgent.getType()).toBe('content_generation');
    });

    it('should handle CONTENT category', () => {
      expect(contentGenerationAgent.canHandle('CONTENT')).toBe(true);
      expect(contentGenerationAgent.canHandle('SPEED')).toBe(false);
    });

    it('should execute successfully', async () => {
      const result = await contentGenerationAgent.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.changes).toBeInstanceOf(Array);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  describe('Agent Registry', () => {
    it('should get agent by type', () => {
      expect(getAgent('speed_optimization')).toBe(speedOptimizationAgent);
      expect(getAgent('seo_fix')).toBe(seoFixAgent);
      expect(getAgent('accessibility')).toBe(accessibilityAgent);
      expect(getAgent('security_hardening')).toBe(securityHardeningAgent);
      expect(getAgent('content_generation')).toBe(contentGenerationAgent);
    });

    it('should return undefined for unknown agent type', () => {
      expect(getAgent('unknown_agent')).toBeUndefined();
    });

    it('should get agent by category', () => {
      expect(getAgentForCategory('SPEED')).toBe(speedOptimizationAgent);
      expect(getAgentForCategory('PERFORMANCE')).toBe(speedOptimizationAgent);
      expect(getAgentForCategory('SEO')).toBe(seoFixAgent);
      expect(getAgentForCategory('ACCESSIBILITY')).toBe(accessibilityAgent);
      expect(getAgentForCategory('SECURITY')).toBe(securityHardeningAgent);
      expect(getAgentForCategory('CONTENT')).toBe(contentGenerationAgent);
    });

    it('should return undefined for unknown category', () => {
      expect(getAgentForCategory('UNKNOWN')).toBeUndefined();
    });
  });

  describe('Agent Execution', () => {
    it('should all agents return consistent result structure', async () => {
      const agents = [
        speedOptimizationAgent,
        seoFixAgent,
        accessibilityAgent,
        securityHardeningAgent,
        contentGenerationAgent,
      ];

      for (const agent of agents) {
        const result = await agent.execute(mockContext);

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('changes');
        expect(result.changes).toBeInstanceOf(Array);

        if (result.success) {
          expect(result.metrics).toBeDefined();
        }
      }
    }, 15000); // 15 second timeout for all agents
  });
});
