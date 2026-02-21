/**
 * Unit tests for LocaleConfigManager class (with mocked database)
 * 
 * Tests:
 * - Retrieval of all supported launch locales
 * - Validation of supported vs unsupported locales
 * - Locale config completeness (language, search engine, currency, regulations, tone)
 * - Caching behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocaleConfigManager } from '../locale-config-manager';
import * as dbConnection from '../db/connection';

// Mock the database connection
vi.mock('../db/connection', () => ({
  query: vi.fn(),
}));

describe('LocaleConfigManager (Unit Tests with Mocks)', () => {
  let manager: LocaleConfigManager;
  const mockQuery = vi.mocked(dbConnection.query);

  // Mock locale configurations
  const mockLocaleConfigs = [
    {
      locale: 'en-US',
      language: 'English (US)',
      primary_search_engine: 'google',
      currency: 'USD',
      regulations: ['FTC'],
      tone: 'professional',
    },
    {
      locale: 'en-GB',
      language: 'English (UK)',
      primary_search_engine: 'google',
      currency: 'GBP',
      regulations: ['GDPR', 'ICO'],
      tone: 'professional',
    },
    {
      locale: 'en-CA',
      language: 'English (Canada)',
      primary_search_engine: 'google',
      currency: 'CAD',
      regulations: ['PIPEDA'],
      tone: 'professional',
    },
    {
      locale: 'en-AU',
      language: 'English (Australia)',
      primary_search_engine: 'google',
      currency: 'AUD',
      regulations: ['Privacy Act'],
      tone: 'professional',
    },
    {
      locale: 'de-DE',
      language: 'German',
      primary_search_engine: 'google',
      currency: 'EUR',
      regulations: ['GDPR', 'TMG'],
      tone: 'formal',
    },
    {
      locale: 'fr-FR',
      language: 'French',
      primary_search_engine: 'google',
      currency: 'EUR',
      regulations: ['GDPR', 'CNIL'],
      tone: 'formal',
    },
    {
      locale: 'es-ES',
      language: 'Spanish',
      primary_search_engine: 'google',
      currency: 'EUR',
      regulations: ['GDPR', 'AEPD'],
      tone: 'formal',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new LocaleConfigManager();

    // Setup default mock behavior
    mockQuery.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('SELECT * FROM locale_configs ORDER BY locale')) {
        return Promise.resolve({ rows: mockLocaleConfigs });
      }
      if (sql.includes('SELECT * FROM locale_configs WHERE locale = $1')) {
        const locale = params?.[0];
        const config = mockLocaleConfigs.find((c) => c.locale === locale);
        return Promise.resolve({ rows: config ? [config] : [] });
      }
      if (sql.includes('SELECT locale FROM locale_configs ORDER BY locale')) {
        return Promise.resolve({ rows: mockLocaleConfigs.map((c) => ({ locale: c.locale })) });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  describe('loadConfigurations', () => {
    it('should load all locale configurations from database', async () => {
      await manager.loadConfigurations();

      const locales = await manager.getSupportedLocales();
      expect(locales.length).toBe(7);
      expect(locales).toContain('en-US');
      expect(locales).toContain('de-DE');
    });

    it('should populate cache after loading', async () => {
      await manager.loadConfigurations();

      const config = await manager.getLocaleConfig('de-DE');
      expect(config).toBeDefined();
      expect(config?.locale).toBe('de-DE');
    });

    it('should call database query', async () => {
      await manager.loadConfigurations();

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('getLocaleConfig', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should retrieve locale config for en-US', async () => {
      const config = await manager.getLocaleConfig('en-US');

      expect(config).toBeDefined();
      expect(config?.locale).toBe('en-US');
      expect(config?.language).toBe('English (US)');
      expect(config?.primarySearchEngine).toBe('google');
      expect(config?.currency).toBe('USD');
    });

    it('should retrieve locale config for de-DE', async () => {
      const config = await manager.getLocaleConfig('de-DE');

      expect(config).toBeDefined();
      expect(config?.locale).toBe('de-DE');
      expect(config?.language).toBe('German');
      expect(config?.currency).toBe('EUR');
      expect(config?.tone).toBe('formal');
      expect(config?.regulations).toContain('GDPR');
    });

    it('should return null for unsupported locale', async () => {
      const config = await manager.getLocaleConfig('ja-JP');

      expect(config).toBeNull();
    });

    it('should include all required fields in config', async () => {
      const config = await manager.getLocaleConfig('de-DE');

      expect(config?.locale).toBeDefined();
      expect(config?.language).toBeDefined();
      expect(config?.primarySearchEngine).toBeDefined();
      expect(config?.currency).toBeDefined();
      expect(config?.regulations).toBeDefined();
      expect(config?.tone).toBeDefined();
      expect(config?.benchmarkCohorts).toBeDefined();
    });

    it('should have valid search engine values', async () => {
      const validEngines = ['google', 'yandex', 'baidu', 'naver'];
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(validEngines).toContain(config?.primarySearchEngine);
      }
    });

    it('should have valid tone values', async () => {
      const validTones = ['formal', 'casual', 'professional'];
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(validTones).toContain(config?.tone);
      }
    });

    it('should have valid currency codes', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.currency).toMatch(/^[A-Z]{3}$/);
      }
    });

    it('should have regulations array for all locales', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(Array.isArray(config?.regulations)).toBe(true);
      }
    });
  });

  describe('validateLocale', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should validate all supported launch locales', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const isValid = await manager.validateLocale(locale);
        expect(isValid).toBe(true);
      }
    });

    it('should reject unsupported locales', async () => {
      const unsupported = ['ja-JP', 'zh-CN', 'ru-RU'];

      for (const locale of unsupported) {
        const isValid = await manager.validateLocale(locale);
        expect(isValid).toBe(false);
      }
    });

    it('should reject empty string', async () => {
      const isValid = await manager.validateLocale('');
      expect(isValid).toBe(false);
    });
  });

  describe('getSupportedLocales', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should return all 7 supported launch locales', async () => {
      const locales = await manager.getSupportedLocales();

      expect(locales.length).toBe(7);
    });

    it('should include all launch locales', async () => {
      const locales = await manager.getSupportedLocales();

      expect(locales).toContain('en-US');
      expect(locales).toContain('en-GB');
      expect(locales).toContain('en-CA');
      expect(locales).toContain('en-AU');
      expect(locales).toContain('de-DE');
      expect(locales).toContain('fr-FR');
      expect(locales).toContain('es-ES');
    });

    it('should not include unsupported locales', async () => {
      const locales = await manager.getSupportedLocales();

      expect(locales).not.toContain('ja-JP');
      expect(locales).not.toContain('zh-CN');
      expect(locales).not.toContain('ru-RU');
    });

    it('should return a copy of the locales array', async () => {
      const locales1 = await manager.getSupportedLocales();
      const locales2 = await manager.getSupportedLocales();

      expect(locales1).toEqual(locales2);
      expect(locales1).not.toBe(locales2);
    });
  });

  describe('validateConfigCompleteness', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should validate all launch locales completeness', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const result = await manager.validateConfigCompleteness(locale);
        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(0);
      }
    });

    it('should return error for non-existent locale', async () => {
      const result = await manager.validateConfigCompleteness('ja-JP');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate required fields', async () => {
      const result = await manager.validateConfigCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      const config = await manager.getLocaleConfig('de-DE');
      expect(config?.language).toBeDefined();
      expect(config?.primarySearchEngine).toBeDefined();
      expect(config?.currency).toBeDefined();
      expect(config?.tone).toBeDefined();
      expect(config?.regulations).toBeDefined();
    });

    it('should validate currency format', async () => {
      const result = await manager.validateConfigCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      const config = await manager.getLocaleConfig('de-DE');
      expect(config?.currency).toMatch(/^[A-Z]{3}$/);
    });

    it('should validate tone values', async () => {
      const result = await manager.validateConfigCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      const config = await manager.getLocaleConfig('de-DE');
      expect(['formal', 'casual', 'professional']).toContain(config?.tone);
    });

    it('should validate search engine values', async () => {
      const result = await manager.validateConfigCompleteness('de-DE');

      expect(result.isValid).toBe(true);
      const config = await manager.getLocaleConfig('de-DE');
      expect(['google', 'yandex', 'baidu', 'naver']).toContain(config?.primarySearchEngine);
    });
  });

  describe('getAllConfigurations', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should return all 7 configurations', async () => {
      const configs = await manager.getAllConfigurations();

      expect(configs.length).toBe(7);
    });

    it('should return complete configurations', async () => {
      const configs = await manager.getAllConfigurations();

      for (const config of configs) {
        expect(config.locale).toBeDefined();
        expect(config.language).toBeDefined();
        expect(config.primarySearchEngine).toBeDefined();
        expect(config.currency).toBeDefined();
        expect(config.regulations).toBeDefined();
        expect(config.tone).toBeDefined();
      }
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should clear cache', async () => {
      let config = await manager.getLocaleConfig('de-DE');
      expect(config).toBeDefined();

      manager.clearCache();

      // After clearing, should still be able to retrieve from database
      config = await manager.getLocaleConfig('de-DE');
      expect(config).toBeDefined();
    });

    it('should refresh locale cache', async () => {
      let config = await manager.getLocaleConfig('de-DE');
      expect(config?.language).toBe('German');

      await manager.refreshLocaleCache('de-DE');

      config = await manager.getLocaleConfig('de-DE');
      expect(config?.language).toBe('German');
    });

    it('should cache multiple locales independently', async () => {
      const config1 = await manager.getLocaleConfig('de-DE');
      const config2 = await manager.getLocaleConfig('fr-FR');

      expect(config1?.locale).toBe('de-DE');
      expect(config2?.locale).toBe('fr-FR');
    });
  });

  describe('Locale Config Completeness', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should have language for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.language).toBeDefined();
        expect(config?.language?.length).toBeGreaterThan(0);
      }
    });

    it('should have search engine for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.primarySearchEngine).toBeDefined();
        expect(['google', 'yandex', 'baidu', 'naver']).toContain(config?.primarySearchEngine);
      }
    });

    it('should have currency for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.currency).toBeDefined();
        expect(config?.currency).toMatch(/^[A-Z]{3}$/);
      }
    });

    it('should have regulations for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(Array.isArray(config?.regulations)).toBe(true);
      }
    });

    it('should have tone for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.tone).toBeDefined();
        expect(['formal', 'casual', 'professional']).toContain(config?.tone);
      }
    });

    it('should have benchmark cohorts for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(Array.isArray(config?.benchmarkCohorts)).toBe(true);
        expect(config?.benchmarkCohorts?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Regulatory Compliance', () => {
    beforeEach(async () => {
      await manager.loadConfigurations();
    });

    it('should have GDPR for EU locales', async () => {
      const euLocales = ['de-DE', 'fr-FR', 'es-ES', 'en-GB'];

      for (const locale of euLocales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.regulations).toContain('GDPR');
      }
    });

    it('should have PIPEDA for en-CA', async () => {
      const config = await manager.getLocaleConfig('en-CA');
      expect(config?.regulations).toContain('PIPEDA');
    });

    it('should have Privacy Act for en-AU', async () => {
      const config = await manager.getLocaleConfig('en-AU');
      expect(config?.regulations).toContain('Privacy Act');
    });

    it('should have regulations for all locales', async () => {
      const locales = await manager.getSupportedLocales();

      for (const locale of locales) {
        const config = await manager.getLocaleConfig(locale);
        expect(config?.regulations.length).toBeGreaterThan(0);
      }
    });
  });
});
