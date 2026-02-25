/**
 * LocaleConfigManager: Loads and manages locale configurations from database
 * 
 * Provides robust configuration management with:
 * - Database-backed locale configurations
 * - Caching for performance
 * - Validation of locale support
 * - Configuration completeness checks
 */

import { LocaleConfig, ValidationResult } from './types';
import { query } from './db/connection';

export class LocaleConfigManager {
  private configCache: Map<string, LocaleConfig> = new Map();
  private supportedLocalesCache: string[] | null = null;
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Load all locale configurations from database on startup
   */
  async loadConfigurations(): Promise<void> {
    try {
      const result = await query('SELECT * FROM locale_configs ORDER BY locale');
      
      this.configCache.clear();
      this.supportedLocalesCache = null;

      for (const row of result.rows) {
        const config: LocaleConfig = {
          locale: row.locale,
          language: row.language,
          primarySearchEngine: row.primary_search_engine as 'google' | 'yandex' | 'baidu' | 'naver',
          currency: row.currency,
          regulations: row.regulations || [],
          tone: row.tone as 'formal' | 'casual' | 'professional',
          benchmarkCohorts: [row.locale], // Default to locale-specific cohort
        };

        this.configCache.set(config.locale, config);
        this.cacheExpiry.set(config.locale, Date.now() + this.CACHE_TTL_MS);
      }

      // Cache supported locales list
      this.supportedLocalesCache = Array.from(this.configCache.keys());
    } catch (error) {
      console.error('Error loading locale configurations from database:', error);
      throw new Error('Failed to load locale configurations');
    }
  }

  /**
   * Retrieve locale-specific configuration
   */
  async getLocaleConfig(locale: string): Promise<LocaleConfig | null> {
    // Check cache first
    if (this.configCache.has(locale)) {
      const expiry = this.cacheExpiry.get(locale);
      if (expiry && expiry > Date.now()) {
        return this.configCache.get(locale) || null;
      }
    }

    // Load from database if not in cache or cache expired
    try {
      const result = await query(
        'SELECT * FROM locale_configs WHERE locale = $1',
        [locale]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const config: LocaleConfig = {
        locale: row.locale,
        language: row.language,
        primarySearchEngine: row.primary_search_engine as 'google' | 'yandex' | 'baidu' | 'naver',
        currency: row.currency,
        regulations: row.regulations || [],
        tone: row.tone as 'formal' | 'casual' | 'professional',
        benchmarkCohorts: [row.locale],
      };

      // Update cache
      this.configCache.set(locale, config);
      this.cacheExpiry.set(locale, Date.now() + this.CACHE_TTL_MS);

      return config;
    } catch (error) {
      console.error(`Error retrieving locale config for ${locale}:`, error);
      return null;
    }
  }

  /**
   * Validate if locale is supported
   */
  async validateLocale(locale: string): Promise<boolean> {
    const supportedLocales = await this.getSupportedLocales();
    return supportedLocales.includes(locale);
  }

  /**
   * Get list of all supported locales
   */
  async getSupportedLocales(): Promise<string[]> {
    // Return cached list if available
    if (this.supportedLocalesCache !== null) {
      return [...this.supportedLocalesCache];
    }

    // Load from database
    try {
      const result = await query(
        'SELECT locale FROM locale_configs ORDER BY locale'
      );

      const locales = result.rows.map((row: any) => row.locale);
      this.supportedLocalesCache = locales;

      return [...locales];
    } catch (error) {
      console.error('Error retrieving supported locales:', error);
      return [];
    }
  }

  /**
   * Validate locale configuration completeness
   * Ensures all required fields are present and valid
   */
  async validateConfigCompleteness(locale: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const config = await this.getLocaleConfig(locale);
    if (!config) {
      return {
        isValid: false,
        errors: [`Locale configuration not found for ${locale}`],
        warnings: [],
      };
    }

    // Check required fields
    if (!config.locale) {
      errors.push('Locale code is missing');
    }

    if (!config.language) {
      errors.push('Language is missing');
    }

    if (!config.primarySearchEngine) {
      errors.push('Primary search engine is missing');
    }

    if (!config.currency) {
      errors.push('Currency is missing');
    }

    if (!config.tone) {
      errors.push('Tone is missing');
    }

    // Validate field values
    const validSearchEngines = ['google', 'yandex', 'baidu', 'naver'];
    if (config.primarySearchEngine && !validSearchEngines.includes(config.primarySearchEngine)) {
      errors.push(
        `Invalid search engine: ${config.primarySearchEngine}. Must be one of: ${validSearchEngines.join(', ')}`
      );
    }

    const validTones = ['formal', 'casual', 'professional'];
    if (config.tone && !validTones.includes(config.tone)) {
      errors.push(
        `Invalid tone: ${config.tone}. Must be one of: ${validTones.join(', ')}`
      );
    }

    // Validate currency format (should be 3-letter code)
    if (config.currency && !/^[A-Z]{3}$/.test(config.currency)) {
      errors.push(`Invalid currency format: ${config.currency}. Must be 3-letter code (e.g., USD, EUR)`);
    }

    // Check regulations array
    if (!Array.isArray(config.regulations)) {
      errors.push('Regulations must be an array');
    }

    // Warnings for missing regulations in regulated locales
    const regulatedLocales: { [key: string]: string[] } = {
      'de-DE': ['GDPR'],
      'fr-FR': ['GDPR'],
      'es-ES': ['GDPR'],
      'en-GB': ['GDPR'],
      'en-CA': ['PIPEDA'],
      'en-AU': ['Privacy Act'],
    };

    if (regulatedLocales[locale]) {
      const expectedRegulations = regulatedLocales[locale];
      const missingRegulations = expectedRegulations.filter(
        (reg) => !config.regulations.includes(reg)
      );

      if (missingRegulations.length > 0) {
        warnings.push(
          `Missing expected regulations for ${locale}: ${missingRegulations.join(', ')}`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.configCache.clear();
    this.supportedLocalesCache = null;
    this.cacheExpiry.clear();
  }

  /**
   * Refresh cache for a specific locale
   */
  async refreshLocaleCache(locale: string): Promise<void> {
    this.configCache.delete(locale);
    this.cacheExpiry.delete(locale);
    await this.getLocaleConfig(locale);
  }

  /**
   * Get all configurations (for admin/debugging purposes)
   */
  async getAllConfigurations(): Promise<LocaleConfig[]> {
    const locales = await this.getSupportedLocales();
    const configs: LocaleConfig[] = [];

    for (const locale of locales) {
      const config = await this.getLocaleConfig(locale);
      if (config) {
        configs.push(config);
      }
    }

    return configs;
  }
}
