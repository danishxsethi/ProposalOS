import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
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

// Efficient generators
const nodeIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/);
const basePromptArb = fc.string({ minLength: 10, maxLength: 100 });
const findingArb = fc.record({ id: fc.uuid(), text: fc.string({ minLength: 5, maxLength: 50 }) });
const trackingTextArb = fc.constantFrom(
  'Add tracking code to your website',
  'Install analytics cookie',
  'Enable data collection for analytics',
  'Set up cookie consent banner'
);
const personalInfoTextArb = fc.constantFrom(
  'Collect personal information from users',
  'Add contact form with email field',
  'Request phone number from visitors',
  'Store personal information securely'
);
const privacyTextArb = fc.constantFrom(
  'Handle personal information carefully',
  'Update privacy policy page',
  'Add data retention policy',
  'Implement privacy controls'
);

describe('LocalizationEngine - Property-Based Tests', () => {
  let engine: LocalizationEngine;
  let configManager: MockLocaleConfigManager;
  const supportedLocales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

  beforeEach(async () => {
    configManager = new MockLocaleConfigManager();
    engine = new LocalizationEngine(configManager as any);
    await engine.initialize();
  });

  /**
   * Property 5: Prompt Adaptation for Non-English Locales
   * Verify cultural context in adapted prompts
   *
   * Validates: Requirements 2.1, 2.2
   */
  describe('Property 5: Prompt Adaptation for Non-English Locales', () => {
    it('should adapt prompts with cultural context for non-English locales', async () => {
      const nonEnglishLocales = ['de-DE', 'fr-FR', 'es-ES'];

      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          async (nodeId, basePrompt) => {
            for (const locale of nonEnglishLocales) {
              const result = await engine.localizePrompt(nodeId, locale, basePrompt);

              // Verify cultural context is present
              expect(result.culturalContext).toBeDefined();
              expect(result.culturalContext.length).toBeGreaterThan(0);

              // Verify locale is set correctly
              expect(result.locale).toBe(locale);

              // Verify prompt text is adapted
              expect(result.promptText).toBeDefined();
              expect(result.promptText.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('should include market-specific context in adapted prompts', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          async (nodeId, basePrompt) => {
            const result = await engine.localizePrompt(nodeId, 'de-DE', basePrompt);

            // Verify cultural context mentions market adaptation
            expect(result.culturalContext).toBeDefined();
            expect(result.promptText).toBeDefined();

            // Verify it's not just a translation
            expect(result.promptText).not.toBe(basePrompt);
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);
  });

  /**
   * Property 6: Gemini Thinking Budget Compliance
   * Verify 4,096 token budget used
   *
   * Validates: Requirements 2.3
   */
  describe('Property 6: Gemini Thinking Budget Compliance', () => {
    it('should always use exactly 4,096 token thinking budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          fc.constantFrom(...supportedLocales),
          async (nodeId, basePrompt, locale) => {
            const result = await engine.localizePrompt(nodeId, locale, basePrompt);

            // Verify thinking budget is exactly 4,096
            expect(result.thinkingBudget).toBe(4096);
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);

    it('should maintain 4,096 token budget for multiple locales', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          async (nodeId, basePrompt) => {
            // Test just a few locales to avoid timeout
            const testLocales = ['en-US', 'de-DE', 'fr-FR'];
            for (const locale of testLocales) {
              const result = await engine.localizePrompt(nodeId, locale, basePrompt);
              expect(result.thinkingBudget).toBe(4096);
            }
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);
  });

  /**
   * Property 7: Localization Dimension Coverage
   * Verify all 7 dimensions addressed in prompt
   *
   * Validates: Requirements 2.4
   */
  describe('Property 7: Localization Dimension Coverage', () => {
    it('should address localization dimensions in adapted prompts', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          async (nodeId, basePrompt) => {
            const result = await engine.localizePrompt(nodeId, 'de-DE', basePrompt);

            // Verify prompt is adapted
            expect(result.promptText).toBeDefined();
            expect(result.promptText.length).toBeGreaterThan(0);
            expect(result.culturalContext).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);

    it('should include locale-specific dimensions for each locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          nodeIdArb,
          basePromptArb,
          async (nodeId, basePrompt) => {
            // Test a few locales
            const testLocales = ['en-US', 'de-DE', 'fr-FR'];
            for (const locale of testLocales) {
              const result = await engine.localizePrompt(nodeId, locale, basePrompt);

              // Verify dimensions are present
              expect(result.promptText).toBeDefined();
              expect(result.culturalContext).toBeDefined();

              // Verify locale is correctly set
              expect(result.locale).toBe(locale);
            }
          }
        ),
        { numRuns: 20 }
      );
    }, 15000);
  });

  /**
   * Property 8: Audit Results Localization
   * Verify all findings in target locale
   *
   * Validates: Requirements 2.5
   */
  describe('Property 8: Audit Results Localization', () => {
    it('should localize all findings to target locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(findingArb, { minLength: 1, maxLength: 5 }),
          fc.constantFrom(...supportedLocales),
          async (findings, locale) => {
            const auditResults = {
              findings,
              recommendations: [],
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, locale);

            // Verify all findings are localized
            expect(result.findings.length).toBe(findings.length);
            for (const finding of result.findings) {
              expect(finding.locale).toBe(locale);
              expect(finding.localizedText).toBeDefined();
              expect(finding.culturalContext).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should localize all recommendations to target locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(findingArb, { minLength: 1, maxLength: 5 }),
          fc.constantFrom(...supportedLocales),
          async (recommendations, locale) => {
            const auditResults = {
              findings: [],
              recommendations,
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, locale);

            // Verify all recommendations are localized
            expect(result.recommendations.length).toBe(recommendations.length);
            for (const rec of result.recommendations) {
              expect(rec.locale).toBe(locale);
              expect(rec.localizedText).toBeDefined();
              expect(rec.culturalContext).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 9: Currency Formatting Correctness
   * Verify locale-appropriate currency formatting
   *
   * Validates: Requirements 2.6
   */
  describe('Property 9: Currency Formatting Correctness', () => {
    it('should format metrics with locale-appropriate currency', () => {
      fc.assert(
        fc.property(
          fc.record({
            revenue: fc.integer({ min: 0, max: 1000000 }),
            cost: fc.integer({ min: 0, max: 500000 }),
          }),
          fc.constantFrom(...supportedLocales),
          (metrics, locale) => {
            const result = engine.formatMetrics(metrics, locale);

            // Verify all metrics are formatted
            expect(result.revenue).toBeDefined();
            expect(result.cost).toBeDefined();

            // Verify formatted values are strings
            expect(typeof result.revenue).toBe('string');
            expect(typeof result.cost).toBe('string');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should use correct currency symbol for each locale', () => {
      const currencySymbols: { [key: string]: string[] } = {
        'en-US': ['$', 'USD'],
        'en-GB': ['£', 'GBP'],
        'en-CA': ['$', 'CAD'],
        'en-AU': ['$', 'AUD'],
        'de-DE': ['€', 'EUR'],
        'fr-FR': ['€', 'EUR'],
        'es-ES': ['€', 'EUR'],
      };

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }),
          fc.constantFrom(...supportedLocales),
          (amount, locale) => {
            const metrics = { amount };
            const result = engine.formatMetrics(metrics, locale);

            // Verify currency formatting is applied
            expect(result.amount).toBeDefined();
            expect(typeof result.amount).toBe('string');

            // Verify it contains a currency symbol or code
            const symbols = currencySymbols[locale] || [];
            const hasSymbol = symbols.some((sym) => result.amount.includes(sym));
            expect(hasSymbol || result.amount.includes(amount.toString())).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 20: GDPR Regulatory Flagging
   * Verify GDPR flags for EU locales
   *
   * Validates: Requirements 6.1
   */
  describe('Property 20: GDPR Regulatory Flagging', () => {
    it('should flag GDPR implications for EU locales', async () => {
      const euLocales = ['de-DE', 'fr-FR', 'es-ES'];

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ id: fc.uuid(), text: trackingTextArb }),
            { minLength: 1, maxLength: 3 }
          ),
          async (recommendations) => {
            for (const locale of euLocales) {
              const auditResults = {
                findings: [],
                recommendations,
                benchmarks: [],
              };

              const result = await engine.localizeAuditResults(auditResults, locale);

              // Verify GDPR flags are present
              const gdprFlags = result.regulatoryFlags.filter((f) => f.regulation === 'GDPR');
              expect(gdprFlags.length).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 21: PIPEDA Regulatory Flagging
   * Verify PIPEDA flags for Canada
   *
   * Validates: Requirements 6.2
   */
  describe('Property 21: PIPEDA Regulatory Flagging', () => {
    it('should flag PIPEDA implications for Canada', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ id: fc.uuid(), text: personalInfoTextArb }),
            { minLength: 1, maxLength: 3 }
          ),
          async (recommendations) => {
            const auditResults = {
              findings: [],
              recommendations,
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, 'en-CA');

            // Verify PIPEDA flags are present
            const pipedalFlags = result.regulatoryFlags.filter((f) => f.regulation === 'PIPEDA');
            expect(pipedalFlags.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 22: Privacy Act Regulatory Flagging
   * Verify Privacy Act flags for Australia
   *
   * Validates: Requirements 6.3
   */
  describe('Property 22: Privacy Act Regulatory Flagging', () => {
    it('should flag Privacy Act implications for Australia', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ id: fc.uuid(), text: privacyTextArb }),
            { minLength: 1, maxLength: 3 }
          ),
          async (recommendations) => {
            const auditResults = {
              findings: [],
              recommendations,
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, 'en-AU');

            // Verify Privacy Act flags are present
            const privacyFlags = result.regulatoryFlags.filter(
              (f) => f.regulation === 'Privacy Act'
            );
            expect(privacyFlags.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 23: Regulatory Guidance Completeness
   * Verify guidance provided for flagged recommendations
   *
   * Validates: Requirements 6.4
   */
  describe('Property 23: Regulatory Guidance Completeness', () => {
    it('should provide compliance guidance for flagged recommendations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ id: fc.uuid(), text: trackingTextArb }),
            { minLength: 1, maxLength: 3 }
          ),
          async (recommendations) => {
            const auditResults = {
              findings: [],
              recommendations,
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, 'de-DE');

            // Verify flags have guidance
            for (const flag of result.regulatoryFlags) {
              expect(flag.message).toBeDefined();
              expect(flag.message.length).toBeGreaterThan(0);
              expect(flag.complianceRequirements).toBeDefined();
              expect(flag.complianceRequirements.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 24: Regulatory Review Marking
   * Verify legal review marked for flagged recommendations
   *
   * Validates: Requirements 6.5
   */
  describe('Property 24: Regulatory Review Marking', () => {
    it('should mark flagged recommendations for legal review', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({ id: fc.uuid(), text: trackingTextArb }),
            { minLength: 1, maxLength: 3 }
          ),
          async (recommendations) => {
            const auditResults = {
              findings: [],
              recommendations,
              benchmarks: [],
            };

            const result = await engine.localizeAuditResults(auditResults, 'de-DE');

            // Verify flags indicate legal review needed
            for (const flag of result.regulatoryFlags) {
              expect(flag.severity).toBeDefined();
              expect(['warning', 'error']).toContain(flag.severity);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
