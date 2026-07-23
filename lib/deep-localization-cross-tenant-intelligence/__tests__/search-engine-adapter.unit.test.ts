/**
 * Unit tests for SearchEngineAdapter
 *
 * Feature: deep-localization-cross-tenant-intelligence
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { SearchEngineAdapter } from '../search-engine-adapter';

describe('SearchEngineAdapter', () => {
  let adapter: SearchEngineAdapter;

  beforeEach(() => {
    adapter = new SearchEngineAdapter();
  });

  // -------------------------------------------------------------------------
  // getPrimarySearchEngine
  // -------------------------------------------------------------------------

  describe('getPrimarySearchEngine', () => {
    it('returns Yandex for ru-RU', () => {
      expect(adapter.getPrimarySearchEngine('ru-RU')).toBe('Yandex');
    });

    it('returns Baidu for zh-CN', () => {
      expect(adapter.getPrimarySearchEngine('zh-CN')).toBe('Baidu');
    });

    it('returns Naver for ko-KR', () => {
      expect(adapter.getPrimarySearchEngine('ko-KR')).toBe('Naver');
    });

    it('returns Yahoo Japan for ja-JP', () => {
      expect(adapter.getPrimarySearchEngine('ja-JP')).toBe('Yahoo Japan');
    });

    it('returns Google for en-US', () => {
      expect(adapter.getPrimarySearchEngine('en-US')).toBe('Google');
    });

    it('returns Google for en-GB', () => {
      expect(adapter.getPrimarySearchEngine('en-GB')).toBe('Google');
    });

    it('returns Google for en-CA', () => {
      expect(adapter.getPrimarySearchEngine('en-CA')).toBe('Google');
    });

    it('returns Google for en-AU', () => {
      expect(adapter.getPrimarySearchEngine('en-AU')).toBe('Google');
    });

    it('returns Google for de-DE', () => {
      expect(adapter.getPrimarySearchEngine('de-DE')).toBe('Google');
    });

    it('returns Google for fr-FR', () => {
      expect(adapter.getPrimarySearchEngine('fr-FR')).toBe('Google');
    });

    it('returns Google for es-ES', () => {
      expect(adapter.getPrimarySearchEngine('es-ES')).toBe('Google');
    });

    it('returns Google for unknown locale', () => {
      expect(adapter.getPrimarySearchEngine('xx-XX')).toBe('Google');
    });
  });

  // -------------------------------------------------------------------------
  // generateSearchEngineGuidance
  // -------------------------------------------------------------------------

  describe('generateSearchEngineGuidance', () => {
    it('references Yandex in guidance for ru-RU', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'schema', description: 'Add structured data' },
        'ru-RU',
      );
      expect(guidance).toContain('Yandex');
    });

    it('references Baidu in guidance for zh-CN', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'meta', description: 'Improve meta tags' },
        'zh-CN',
      );
      expect(guidance).toContain('Baidu');
    });

    it('references Naver in guidance for ko-KR', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'content', description: 'Improve content' },
        'ko-KR',
      );
      expect(guidance).toContain('Naver');
    });

    it('references Yahoo Japan in guidance for ja-JP', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'performance', description: 'Improve page speed' },
        'ja-JP',
      );
      expect(guidance).toContain('Yahoo Japan');
    });

    it('references Google in guidance for en-US', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'schema', description: 'Add structured data' },
        'en-US',
      );
      expect(guidance).toContain('Google');
    });

    it('returns non-empty guidance for any recommendation type', () => {
      const guidance = adapter.generateSearchEngineGuidance(
        { type: 'unknown_type', description: 'Some recommendation' },
        'ru-RU',
      );
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance).toContain('Yandex');
    });
  });

  // -------------------------------------------------------------------------
  // getCompetitorAnalysisEngine
  // -------------------------------------------------------------------------

  describe('getCompetitorAnalysisEngine', () => {
    it('uses Yandex for competitor analysis in ru-RU', () => {
      expect(adapter.getCompetitorAnalysisEngine('ru-RU')).toBe('Yandex');
    });

    it('uses Baidu for competitor analysis in zh-CN', () => {
      expect(adapter.getCompetitorAnalysisEngine('zh-CN')).toBe('Baidu');
    });

    it('uses Naver for competitor analysis in ko-KR', () => {
      expect(adapter.getCompetitorAnalysisEngine('ko-KR')).toBe('Naver');
    });

    it('uses Yahoo Japan for competitor analysis in ja-JP', () => {
      expect(adapter.getCompetitorAnalysisEngine('ja-JP')).toBe('Yahoo Japan');
    });

    it('uses Google for competitor analysis in en-US', () => {
      expect(adapter.getCompetitorAnalysisEngine('en-US')).toBe('Google');
    });

    it('matches the primary search engine for every locale', () => {
      const locales = ['ru-RU', 'zh-CN', 'ko-KR', 'ja-JP', 'en-US', 'de-DE', 'fr-FR'];
      for (const locale of locales) {
        expect(adapter.getCompetitorAnalysisEngine(locale)).toBe(
          adapter.getPrimarySearchEngine(locale),
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // getSearchVisibilityMetrics
  // -------------------------------------------------------------------------

  describe('getSearchVisibilityMetrics', () => {
    it('returns Yandex as primary engine for ru-RU', () => {
      const result = adapter.getSearchVisibilityMetrics('ru-RU');
      expect(result.primaryEngine).toBe('Yandex');
    });

    it('returns Baidu as primary engine for zh-CN', () => {
      const result = adapter.getSearchVisibilityMetrics('zh-CN');
      expect(result.primaryEngine).toBe('Baidu');
    });

    it('returns Naver as primary engine for ko-KR', () => {
      const result = adapter.getSearchVisibilityMetrics('ko-KR');
      expect(result.primaryEngine).toBe('Naver');
    });

    it('returns Yahoo Japan as primary engine for ja-JP', () => {
      const result = adapter.getSearchVisibilityMetrics('ja-JP');
      expect(result.primaryEngine).toBe('Yahoo Japan');
    });

    it('returns Google as primary engine for en-US', () => {
      const result = adapter.getSearchVisibilityMetrics('en-US');
      expect(result.primaryEngine).toBe('Google');
    });

    it('includes engine name in metrics for ru-RU', () => {
      const result = adapter.getSearchVisibilityMetrics('ru-RU');
      const allMetrics = result.metrics.join(' ');
      expect(allMetrics).toContain('Yandex');
    });

    it('returns at least one metric for every locale', () => {
      const locales = ['ru-RU', 'zh-CN', 'ko-KR', 'ja-JP', 'en-US', 'de-DE'];
      for (const locale of locales) {
        const result = adapter.getSearchVisibilityMetrics(locale);
        expect(result.metrics.length).toBeGreaterThan(0);
      }
    });
  });
});
