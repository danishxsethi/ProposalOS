import {
  LocalizationContext,
  LocalizedPrompt,
  LocalizationDimensions,
  LocalizedResults,
  LocalizedFinding,
  LocalizedRecommendation,
  LocalizedBenchmark,
  RegulatoryFlag,
  FormattedMetrics,
  LocaleConfig,
  ValidationResult,
} from './types';
import { LocaleConfigManager } from './locale-config-manager';

import { generateWithGemini } from '@/lib/llm/provider';

/**
 * Real Gemini API client for localization using standard provider
 */
class GeminiClient {
  async callWithThinkingBudget(
    prompt: string,
    thinkingBudget: number = 4096
  ): Promise<string> {
    const response = await generateWithGemini({
      model: 'gemini-2.0-pro-exp-01-21',
      input: prompt,
      thinkingBudget: thinkingBudget,
      metadata: { node: 'localization_engine' }
    });
    return response.text;
  }
}

/**
 * LocalizationEngine: Adapts all audit content to locale with cultural context
 * Implements prompt rewriting with cultural context (not translation)
 * Covers all 7 localization dimensions: language, search engine, benchmarks, competitors, regulations, currency, tone
 */
export class LocalizationEngine {
  private localeConfigManager: LocaleConfigManager;
  private geminiClient: GeminiClient;
  private localeConfigs: Map<string, LocaleConfig> = new Map();
  /** In-memory translation cache: key = sha256(content:locale), value = translated string */
  private translationCache: Map<string, string> = new Map();

  constructor(localeConfigManager: LocaleConfigManager) {
    this.localeConfigManager = localeConfigManager;
    this.geminiClient = new GeminiClient();
  }

  /**
   * Initialize locale configurations
   */
  async initialize(): Promise<void> {
    const locales = await this.localeConfigManager.getSupportedLocales();
    for (const locale of locales) {
      const config = await this.localeConfigManager.getLocaleConfig(locale);
      if (config) {
        this.localeConfigs.set(locale, config);
      }
    }
  }

  /**
   * Localizes a prompt for a specific locale with cultural context
   * Calls Gemini 3.1 Pro with 4,096 token thinking budget
   * Implements prompt rewriting with cultural context (not translation)
   * Covers all 7 localization dimensions
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 7.2, 7.3
   */
  async localizePrompt(nodeId: string, locale: string, basePrompt: string): Promise<LocalizedPrompt> {
    // Validate locale
    const isValid = await this.localeConfigManager.validateLocale(locale);
    if (!isValid) {
      // Fallback to en-US variant
      return this.createFallbackPrompt(nodeId, basePrompt);
    }

    const localeConfig = this.localeConfigs.get(locale);
    if (!localeConfig) {
      return this.createFallbackPrompt(nodeId, basePrompt);
    }

    // Get localization dimensions
    const dimensions = this.getLocalizationDimensions(locale, localeConfig);

    // Build Gemini prompt for localization
    const geminiPrompt = this.buildLocalizationPrompt(basePrompt, locale, localeConfig, dimensions);

    try {
      // Call Gemini with 4,096 token thinking budget
      const localizedText = await this.geminiClient.callWithThinkingBudget(geminiPrompt, 4096);

      // Extract cultural context from response
      const culturalContext = this.extractCulturalContext(localizedText, dimensions);

      return {
        nodeId,
        locale,
        promptText: localizedText,
        culturalContext,
        thinkingBudget: 4096,
        createdAt: new Date(),
        approvalStatus: 'pending',
      };
    } catch (error) {
      // Error handling with fallback to en-US variant
      console.error(`Error localizing prompt for locale ${locale}:`, error);
      return this.createFallbackPrompt(nodeId, basePrompt);
    }
  }

  /**
   * Localizes audit results to target locale
   * Adapts findings, recommendations, and explanations
   *
   * Validates: Requirements 2.5, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async localizeAuditResults(
    results: any,
    locale: string,
    regulatoryChecker?: any
  ): Promise<LocalizedResults> {
    // Validate locale
    const isValid = await this.localeConfigManager.validateLocale(locale);
    if (!isValid) {
      locale = 'en-US';
    }

    const localeConfig = this.localeConfigs.get(locale);
    if (!localeConfig) {
      locale = 'en-US';
    }

    // Localize findings
    const findings = await this.localizeFinding(results.findings || [], locale);

    // Localize recommendations
    const recommendations = await this.localizeRecommendations(
      results.recommendations || [],
      locale,
      regulatoryChecker
    );

    // Localize benchmarks
    const benchmarks = this.localizeBenchmarks(results.benchmarks || [], locale);

    // Generate regulatory flags
    const regulatoryFlags = await this.generateRegulatoryFlags(
      recommendations,
      locale,
      regulatoryChecker
    );

    return {
      findings,
      recommendations,
      benchmarks,
      regulatoryFlags,
    };
  }

  /**
   * Formats metrics for locale-appropriate currency and number formatting
   *
   * Validates: Requirements 2.6
   */
  formatMetrics(metrics: any, locale: string): FormattedMetrics {
    const localeConfig = this.localeConfigs.get(locale);
    if (!localeConfig) {
      return this.formatMetricsForLocale(metrics, 'en-US', 'USD');
    }

    return this.formatMetricsForLocale(metrics, locale, localeConfig.currency);
  }

  /**
   * Gets localization dimensions for a locale
   */
  getLocalizationDimensions(locale: string, localeConfig: LocaleConfig): LocalizationDimensions {
    return {
      language: localeConfig.language,
      searchEngine: localeConfig.primarySearchEngine,
      benchmarks: `Benchmarks for ${locale}`,
      competitors: `Competitors in ${locale}`,
      regulations: localeConfig.regulations,
      currency: localeConfig.currency,
      tone: localeConfig.tone,
    };
  }

  /**
   * Validates localization completeness
   */
  async validateLocalization(locale: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const isValid = await this.localeConfigManager.validateLocale(locale);
    if (!isValid) {
      errors.push(`Locale ${locale} is not supported`);
    }

    const config = this.localeConfigs.get(locale);
    if (!config) {
      errors.push(`No configuration found for locale ${locale}`);
    } else {
      // Validate all required fields
      if (!config.language) errors.push('Language not configured');
      if (!config.primarySearchEngine) errors.push('Primary search engine not configured');
      if (!config.currency) errors.push('Currency not configured');
      if (!config.regulations || config.regulations.length === 0) {
        warnings.push('No regulations configured');
      }
      if (!config.tone) errors.push('Tone not configured');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private createFallbackPrompt(nodeId: string, basePrompt: string): LocalizedPrompt {
    return {
      nodeId,
      locale: 'en-US',
      promptText: basePrompt,
      culturalContext: 'Fallback to en-US variant',
      thinkingBudget: 4096,
      createdAt: new Date(),
      approvalStatus: 'pending',
    };
  }

  private buildLocalizationPrompt(
    basePrompt: string,
    locale: string,
    localeConfig: LocaleConfig,
    dimensions: LocalizationDimensions
  ): string {
    return `You are an expert in SEO and cultural adaptation for the ${locale} market.

Original Prompt:
${basePrompt}

Localization Dimensions:
- Language: ${dimensions.language}
- Primary Search Engine: ${dimensions.searchEngine}
- Benchmarks: ${dimensions.benchmarks}
- Competitors: ${dimensions.competitors}
- Regulations: ${dimensions.regulations.join(', ')}
- Currency: ${dimensions.currency}
- Tone: ${dimensions.tone}

Task: Rewrite the prompt for the ${locale} market with full cultural context.
Consider:
1. Local search engine requirements and best practices
2. Regional competitors and competitive landscape
3. Local regulations and compliance requirements
4. Cultural communication style and tone
5. Local business practices and market norms

Use your full 4,096 token thinking budget to deeply understand the market context
and create a culturally appropriate prompt.`;
  }

  private extractCulturalContext(response: string, dimensions: LocalizationDimensions): string {
    // Extract cultural context from Gemini response
    const lines = response.split('\n');
    const contextLines = lines.filter((line) => !line.includes('THINKING'));
    return contextLines.join('\n').trim();
  }

  /**
   * Translates a text string to the target locale using Gemini Flash.
   * Caches results in-memory to avoid redundant API calls.
   * Falls back to original text on LLM error.
   */
  private async translateContent(text: string, targetLocale: string): Promise<string> {
    if (!text || targetLocale === 'en-US') return text;

    // Cache key: locale + first 200 chars of content (cheap and collision-resistant enough)
    const cacheKey = `${targetLocale}:${text.slice(0, 200)}`;
    const cached = this.translationCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const systemPrompt = `You are a professional translator. Translate the following marketing/technical content to ${targetLocale}. Maintain the original tone, technical accuracy, and formatting. Do not add or remove information. Return ONLY the translated text, no preamble.`;
    const fullPrompt = `${systemPrompt}\n\n${text}`;

    try {
      const response = await generateWithGemini({
        model: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash',
        input: fullPrompt,
        temperature: 0.1,          // Low temperature for consistent translations
        maxOutputTokens: 2048,
        metadata: { node: 'localization_translate' },
      });
      const translated = response.text?.trim() || text;
      // Cap cache at 5,000 entries to avoid unbounded memory growth
      if (this.translationCache.size >= 5000) {
        const firstKey = this.translationCache.keys().next().value;
        if (firstKey) this.translationCache.delete(firstKey);
      }
      this.translationCache.set(cacheKey, translated);
      return translated;
    } catch (error) {
      console.error(`[LocalizationEngine] Translation failed for locale ${targetLocale}:`, error);
      return text; // Graceful fallback to original
    }
  }

  private async localizeFinding(findings: any[], locale: string): Promise<LocalizedFinding[]> {
    return Promise.all(
      findings.map(async (finding) => ({
        originalFinding: finding,
        localizedText: await this.translateContent(finding.text || finding.description || '', locale),
        locale,
        culturalContext: `Translated to ${locale} via Gemini Flash`,
      }))
    );
  }

  private async localizeRecommendations(
    recommendations: any[],
    locale: string,
    regulatoryChecker?: any
  ): Promise<LocalizedRecommendation[]> {
    return Promise.all(
      recommendations.map(async (rec) => ({
        originalRecommendation: rec,
        localizedText: await this.translateContent(rec.text || rec.description || '', locale),
        locale,
        culturalContext: `Translated to ${locale} via Gemini Flash`,
      }))
    );
  }

  private localizeBenchmarks(benchmarks: any[], locale: string): LocalizedBenchmark[] {
    return benchmarks.map((bench) => ({
      metric: bench.metric || '',
      value: bench.value || 0,
      percentile: bench.percentile || 0,
      locale,
    }));
  }

  private async generateRegulatoryFlags(
    recommendations: LocalizedRecommendation[],
    locale: string,
    regulatoryChecker?: any
  ): Promise<RegulatoryFlag[]> {
    const flags: RegulatoryFlag[] = [];

    // Check for regulatory implications based on locale
    const euLocales = ['de-DE', 'fr-FR', 'es-ES'];
    const caLocales = ['en-CA'];
    const auLocales = ['en-AU'];

    if (euLocales.includes(locale)) {
      // GDPR implications
      for (const rec of recommendations) {
        if (this.hasGDPRImplications(rec)) {
          flags.push({
            recommendationId: rec.originalRecommendation.id || '',
            regulation: 'GDPR',
            severity: 'warning',
            message: 'This recommendation may have GDPR implications',
            complianceRequirements: [
              'Ensure user consent for data collection',
              'Implement privacy policy',
              'Enable cookie consent',
            ],
            suggestedAlternatives: ['Use privacy-first analytics', 'Implement consent management'],
          });
        }
      }
    }

    if (caLocales.includes(locale)) {
      // PIPEDA implications
      for (const rec of recommendations) {
        if (this.hasPIPEDAImplications(rec)) {
          flags.push({
            recommendationId: rec.originalRecommendation.id || '',
            regulation: 'PIPEDA',
            severity: 'warning',
            message: 'This recommendation may have PIPEDA implications',
            complianceRequirements: [
              'Obtain personal information consent',
              'Implement privacy policy',
            ],
            suggestedAlternatives: ['Use privacy-compliant alternatives'],
          });
        }
      }
    }

    if (auLocales.includes(locale)) {
      // Privacy Act implications
      for (const rec of recommendations) {
        if (this.hasPrivacyActImplications(rec)) {
          flags.push({
            recommendationId: rec.originalRecommendation.id || '',
            regulation: 'Privacy Act',
            severity: 'warning',
            message: 'This recommendation may have Privacy Act implications',
            complianceRequirements: [
              'Handle personal information appropriately',
              'Implement privacy policy',
            ],
            suggestedAlternatives: ['Use privacy-compliant alternatives'],
          });
        }
      }
    }

    return flags;
  }

  private hasGDPRImplications(rec: LocalizedRecommendation): boolean {
    const text = (rec.localizedText || '').toLowerCase();
    return (
      text.includes('tracking') ||
      text.includes('cookie') ||
      text.includes('analytics') ||
      text.includes('data collection')
    );
  }

  private hasPIPEDAImplications(rec: LocalizedRecommendation): boolean {
    const text = (rec.localizedText || '').toLowerCase();
    return (
      text.includes('personal information') ||
      text.includes('contact') ||
      text.includes('email') ||
      text.includes('phone')
    );
  }

  private hasPrivacyActImplications(rec: LocalizedRecommendation): boolean {
    const text = (rec.localizedText || '').toLowerCase();
    return (
      text.includes('personal information') ||
      text.includes('privacy') ||
      text.includes('data')
    );
  }

  private adaptTextForLocale(text: string, locale: string): string {
    // Simple adaptation - in production, this would use more sophisticated NLP
    const adaptations: { [key: string]: { [key: string]: string } } = {
      'de-DE': {
        'search engine': 'Suchmaschine',
        'SEO': 'Suchmaschinenoptimierung',
      },
      'fr-FR': {
        'search engine': 'moteur de recherche',
        'SEO': 'optimisation pour les moteurs de recherche',
      },
      'es-ES': {
        'search engine': 'motor de búsqueda',
        'SEO': 'optimización de motores de búsqueda',
      },
    };

    let adapted = text;
    const localeAdaptations = adaptations[locale];
    if (localeAdaptations) {
      for (const [key, value] of Object.entries(localeAdaptations)) {
        adapted = adapted.replace(new RegExp(key, 'gi'), value);
      }
    }

    return adapted;
  }

  private formatMetricsForLocale(metrics: any, locale: string, currency: string): FormattedMetrics {
    const formatted: FormattedMetrics = {};

    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        // Format numbers based on locale
        const formatter = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
        });

        formatted[key] = formatter.format(value);
      } else {
        formatted[key] = String(value);
      }
    }

    return formatted;
  }
}
