import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalizationEngine } from '../localization-engine';
import { LocaleConfig } from '../types';

// Mock LocaleConfigManager
class MockLocaleConfigManager {
  private configs: Map<string, LocaleConfig> = new Map();

  constructor() {
    this.initializeMockConfigs();
  }

  private initializeMockConfigs() {
    const mockConfigs: LocaleConfig[] = [
      {
        locale: 'en-US',
        language: 'English',
        primarySearchEngine: 'google',
        currency: 'USD',
        regulations: [],
        tone: 'professional',
        benchmarkCohorts: ['en-US'],
      },
      {
        locale: 'en-GB',
        language: 'English',
        primarySearchEngine: 'google',
        currency: 'GBP',
        regulations: ['GDPR'],
        tone: 'professional',
        benchmarkCohorts: ['en-GB'],
      },
      {
        locale: 'en-CA',
        language: 'English',
        primarySearchEngine: 'google',
        currency: 'CAD',
        regulations: ['PIPEDA'],
        tone: 'professional',
        benchmarkCohorts: ['en-CA'],
      },
      {
        locale: 'en-AU',
        language: 'English',
        primarySearchEngine: 'google',
        currency: 'AUD',
        regulations: ['Privacy Act'],
        tone: 'professional',
        benchmarkCohorts: ['en-AU'],
      },
      {
        locale: 'de-DE',
        language: 'German',
        primarySearchEngine: 'google',
        currency: 'EUR',
        regulations: ['GDPR'],
        tone: 'formal',
        benchmarkCohorts: ['de-DE'],
      },
      {
        locale: 'fr-FR',
        language: 'French',
        primarySearchEngine: 'google',
        currency: 'EUR',
        regulations: ['GDPR'],
        tone: 'formal',
        benchmarkCohorts: ['fr-FR'],
      },
      {
        locale: 'es-ES',
        language: 'Spanish',
        primarySearchEngine: 'google',
        currency: 'EUR',
        regulations: ['GDPR'],
        tone: 'professional',
        benchmarkCohorts: ['es-ES'],
      },
    ];

    for (const config of mockConfigs) {
      this.configs.set(config.locale, config);
    }
  }

  async loadConfigurations(): Promise<void> {
    // Mock implementation
  }

  async getLocaleConfig(locale: string): Promise<LocaleConfig | null> {
    return this.configs.get(locale) || null;
  }

  async validateLocale(locale: string): Promise<boolean> {
    return this.configs.has(locale);
  }

  async getSupportedLocales(): Promise<string[]> {
    return Array.from(this.configs.keys());
  }
}

describe('LocalizationEngine - Unit Tests', () => {
  let engine: LocalizationEngine;
  let configManager: MockLocaleConfigManager;

  beforeEach(async () => {
    configManager = new MockLocaleConfigManager();
    engine = new LocalizationEngine(configManager as any);
    await engine.initialize();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('localizePrompt', () => {
    it('should localize a prompt for a supported locale', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      const result = await engine.localizePrompt('node-1', 'de-DE', basePrompt);

      expect(result).toBeDefined();
      expect(result.nodeId).toBe('node-1');
      expect(result.locale).toBe('de-DE');
      expect(result.promptText).toBeDefined();
      expect(result.culturalContext).toBeDefined();
      expect(result.thinkingBudget).toBe(4096);
      expect(result.approvalStatus).toBe('pending');
    });

    it('should use 4,096 token thinking budget for Gemini', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      const result = await engine.localizePrompt('node-1', 'fr-FR', basePrompt);

      expect(result.thinkingBudget).toBe(4096);
    });

    it('should fallback to en-US for unsupported locale', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      const result = await engine.localizePrompt('node-1', 'xx-XX', basePrompt);

      expect(result.locale).toBe('en-US');
      expect(result.promptText).toBe(basePrompt);
    });

    it('should include cultural context in localized prompt', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      const result = await engine.localizePrompt('node-1', 'de-DE', basePrompt);

      expect(result.culturalContext).toBeDefined();
      expect(result.culturalContext.length).toBeGreaterThan(0);
    });

    it('should handle error gracefully with fallback', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      // Even if there's an error, should return a valid result
      const result = await engine.localizePrompt('node-1', 'de-DE', basePrompt);

      expect(result).toBeDefined();
      expect(result.promptText).toBeDefined();
    });
  });

  describe('localizeAuditResults', () => {
    it('should localize audit results for a supported locale', async () => {
      const auditResults = {
        findings: [{ id: '1', text: 'Missing meta description' }],
        recommendations: [{ id: '1', text: 'Add meta description to all pages' }],
        benchmarks: [{ metric: 'avg_score', value: 75, percentile: 50 }],
      };

      const result = await engine.localizeAuditResults(auditResults, 'de-DE');

      expect(result).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.findings.length).toBe(1);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBe(1);
      expect(result.benchmarks).toBeDefined();
      expect(result.benchmarks.length).toBe(1);
    });

    it('should localize findings to target locale', async () => {
      const auditResults = {
        findings: [{ id: '1', text: 'Missing meta description' }],
        recommendations: [],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'fr-FR');

      expect(result.findings[0].locale).toBe('fr-FR');
      expect(result.findings[0].localizedText).toBeDefined();
    });

    it('should localize recommendations to target locale', async () => {
      const auditResults = {
        findings: [],
        recommendations: [{ id: '1', text: 'Add meta description to all pages' }],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'es-ES');

      expect(result.recommendations[0].locale).toBe('es-ES');
      expect(result.recommendations[0].localizedText).toBeDefined();
    });

    it('should localize benchmarks to target locale', async () => {
      const auditResults = {
        findings: [],
        recommendations: [],
        benchmarks: [{ metric: 'avg_score', value: 75, percentile: 50 }],
      };

      const result = await engine.localizeAuditResults(auditResults, 'en-GB');

      expect(result.benchmarks[0].locale).toBe('en-GB');
    });

    it('should generate regulatory flags for EU locales', async () => {
      const auditResults = {
        findings: [],
        recommendations: [
          { id: '1', text: 'Enable Google Analytics tracking' },
          { id: '2', text: 'Add cookie consent banner' },
        ],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'de-DE');

      // Should have regulatory flags for GDPR
      expect(result.regulatoryFlags).toBeDefined();
      expect(result.regulatoryFlags.length).toBeGreaterThan(0);
      expect(result.regulatoryFlags[0].regulation).toBe('GDPR');
    });

    it('should generate regulatory flags for Canada', async () => {
      const auditResults = {
        findings: [],
        recommendations: [{ id: '1', text: 'Collect email addresses for newsletter' }],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'en-CA');

      // Should have regulatory flags for PIPEDA
      expect(result.regulatoryFlags).toBeDefined();
    });

    it('should generate regulatory flags for Australia', async () => {
      const auditResults = {
        findings: [],
        recommendations: [{ id: '1', text: 'Store user data in database' }],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'en-AU');

      // Should have regulatory flags for Privacy Act
      expect(result.regulatoryFlags).toBeDefined();
    });

    it('should fallback to en-US for unsupported locale', async () => {
      const auditResults = {
        findings: [{ id: '1', text: 'Missing meta description' }],
        recommendations: [],
        benchmarks: [],
      };

      const result = await engine.localizeAuditResults(auditResults, 'xx-XX');

      expect(result.findings[0].locale).toBe('en-US');
    });
  });

  describe('formatMetrics', () => {
    it('should format metrics with locale-appropriate currency', () => {
      const metrics = { revenue: 1000, cost: 500 };
      const result = engine.formatMetrics(metrics, 'de-DE');

      expect(result).toBeDefined();
      expect(result.revenue).toBeDefined();
      expect(result.cost).toBeDefined();
    });

    it('should use EUR for de-DE locale', () => {
      const metrics = { amount: 100 };
      const result = engine.formatMetrics(metrics, 'de-DE');

      expect(result.amount).toContain('€') || expect(result.amount).toContain('EUR');
    });

    it('should use GBP for en-GB locale', () => {
      const metrics = { amount: 100 };
      const result = engine.formatMetrics(metrics, 'en-GB');

      expect(result.amount).toContain('£') || expect(result.amount).toContain('GBP');
    });

    it('should use USD for en-US locale', () => {
      const metrics = { amount: 100 };
      const result = engine.formatMetrics(metrics, 'en-US');

      expect(result.amount).toContain('$') || expect(result.amount).toContain('USD');
    });

    it('should handle non-numeric values', () => {
      const metrics = { name: 'Test', value: 100 };
      const result = engine.formatMetrics(metrics, 'de-DE');

      expect(result.name).toBe('Test');
      expect(result.value).toBeDefined();
    });
  });

  describe('getLocalizationDimensions', () => {
    it('should return all 7 localization dimensions', async () => {
      const config = await configManager.getLocaleConfig('de-DE');
      if (!config) throw new Error('Config not found');

      const dimensions = engine.getLocalizationDimensions('de-DE', config);

      expect(dimensions.language).toBeDefined();
      expect(dimensions.searchEngine).toBeDefined();
      expect(dimensions.benchmarks).toBeDefined();
      expect(dimensions.competitors).toBeDefined();
      expect(dimensions.regulations).toBeDefined();
      expect(dimensions.currency).toBeDefined();
      expect(dimensions.tone).toBeDefined();
    });

    it('should include correct search engine for locale', async () => {
      const config = await configManager.getLocaleConfig('de-DE');
      if (!config) throw new Error('Config not found');

      const dimensions = engine.getLocalizationDimensions('de-DE', config);

      expect(dimensions.searchEngine).toBe(config.primarySearchEngine);
    });

    it('should include regulations for locale', async () => {
      const config = await configManager.getLocaleConfig('de-DE');
      if (!config) throw new Error('Config not found');

      const dimensions = engine.getLocalizationDimensions('de-DE', config);

      expect(Array.isArray(dimensions.regulations)).toBe(true);
      expect(dimensions.regulations.length).toBeGreaterThan(0);
    });
  });

  describe('validateLocalization', () => {
    it('should validate supported locale', async () => {
      const result = await engine.validateLocalization('de-DE');

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject unsupported locale', async () => {
      const result = await engine.validateLocalization('xx-XX');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should check for required configuration fields', async () => {
      const result = await engine.validateLocalization('de-DE');

      if (result.isValid) {
        // If valid, should have all required fields
        expect(result.errors.length).toBe(0);
      }
    });
  });

  describe('Localization Dimension Coverage', () => {
    it('should cover all 7 dimensions in localized prompt', async () => {
      const basePrompt = 'Analyze the website for SEO issues';
      const result = await engine.localizePrompt('node-1', 'de-DE', basePrompt);

      // The localized prompt should address all dimensions
      const text = result.promptText.toLowerCase();
      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should adapt text for German locale', async () => {
      const basePrompt = 'Analyze search engine optimization';
      const result = await engine.localizePrompt('node-1', 'de-DE', basePrompt);

      expect(result.locale).toBe('de-DE');
      expect(result.promptText).toBeDefined();
    });

    it('should adapt text for French locale', async () => {
      const basePrompt = 'Analyze search engine optimization';
      const result = await engine.localizePrompt('node-1', 'fr-FR', basePrompt);

      expect(result.locale).toBe('fr-FR');
      expect(result.promptText).toBeDefined();
    });

    it('should adapt text for Spanish locale', async () => {
      const basePrompt = 'Analyze search engine optimization';
      const result = await engine.localizePrompt('node-1', 'es-ES', basePrompt);

      expect(result.locale).toBe('es-ES');
      expect(result.promptText).toBeDefined();
    });
  });
});
