/**
 * CompetitorAnalysisLocalizer
 *
 * Implements locale-specific competitor identification and analysis.
 * Identifies competitors filtered by locale and industry, supports
 * multi-locale analysis, and provides locale-specific metrics.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { SearchEngineAdapter } from './search-engine-adapter';

// ---------------------------------------------------------------------------
// Competitor Types
// ---------------------------------------------------------------------------

export interface Competitor {
  domain: string;
  name: string;
  locale: string;
  industry: string;
  searchEngine: string;
  rankingPosition?: number;
  estimatedTraffic?: number;
}

export interface LocaleMetrics {
  locale: string;
  searchEngine: string;
  rankingPosition: number | null;
  searchVisibilityScore: number;
  organicKeywords: number;
  estimatedMonthlyTraffic: number;
  topKeywords: string[];
}

// ---------------------------------------------------------------------------
// Locale → Industry Competitor Data
// ---------------------------------------------------------------------------

/**
 * Simulated competitor data keyed by locale and industry.
 * In production this would be backed by a real data source / search API.
 */
const COMPETITOR_DATA: Record<string, Record<string, Competitor[]>> = {
  'fr-FR': {
    dental: [
      { domain: 'dentiste-paris.fr', name: 'Dentiste Paris', locale: 'fr-FR', industry: 'dental', searchEngine: 'Google' },
      { domain: 'clinique-dentaire.fr', name: 'Clinique Dentaire', locale: 'fr-FR', industry: 'dental', searchEngine: 'Google' },
    ],
    restaurant: [
      { domain: 'restaurant-lyon.fr', name: 'Restaurant Lyon', locale: 'fr-FR', industry: 'restaurant', searchEngine: 'Google' },
    ],
  },
  'de-DE': {
    dental: [
      { domain: 'zahnarzt-berlin.de', name: 'Zahnarzt Berlin', locale: 'de-DE', industry: 'dental', searchEngine: 'Google' },
      { domain: 'dental-praxis.de', name: 'Dental Praxis', locale: 'de-DE', industry: 'dental', searchEngine: 'Google' },
    ],
    restaurant: [
      { domain: 'restaurant-muenchen.de', name: 'Restaurant München', locale: 'de-DE', industry: 'restaurant', searchEngine: 'Google' },
    ],
  },
  'ru-RU': {
    dental: [
      { domain: 'stomatolog-moskva.ru', name: 'Стоматолог Москва', locale: 'ru-RU', industry: 'dental', searchEngine: 'Yandex' },
    ],
    ecommerce: [
      { domain: 'magazin.ru', name: 'Магазин', locale: 'ru-RU', industry: 'ecommerce', searchEngine: 'Yandex' },
    ],
  },
  'zh-CN': {
    ecommerce: [
      { domain: 'shop.cn', name: '网上商店', locale: 'zh-CN', industry: 'ecommerce', searchEngine: 'Baidu' },
    ],
  },
  'ko-KR': {
    restaurant: [
      { domain: 'restaurant-seoul.kr', name: '서울 레스토랑', locale: 'ko-KR', industry: 'restaurant', searchEngine: 'Naver' },
    ],
  },
  'en-US': {
    dental: [
      { domain: 'dentist-nyc.com', name: 'NYC Dentist', locale: 'en-US', industry: 'dental', searchEngine: 'Google' },
      { domain: 'smile-dental.com', name: 'Smile Dental', locale: 'en-US', industry: 'dental', searchEngine: 'Google' },
    ],
    restaurant: [
      { domain: 'restaurant-nyc.com', name: 'NYC Restaurant', locale: 'en-US', industry: 'restaurant', searchEngine: 'Google' },
    ],
  },
};

// ---------------------------------------------------------------------------
// CompetitorAnalysisLocalizer Class
// ---------------------------------------------------------------------------

export class CompetitorAnalysisLocalizer {
  private readonly searchEngineAdapter: SearchEngineAdapter;

  constructor(searchEngineAdapter?: SearchEngineAdapter) {
    this.searchEngineAdapter = searchEngineAdapter ?? new SearchEngineAdapter();
  }

  /**
   * Identifies competitors in the same locale and industry.
   *
   * Requirement 5.1
   */
  async identifyCompetitors(locale: string, industry: string): Promise<Competitor[]> {
    const searchEngine = this.searchEngineAdapter.getCompetitorAnalysisEngine(locale);
    const localeData = COMPETITOR_DATA[locale] ?? {};
    const industryCompetitors = localeData[industry] ?? [];

    // Enrich with the locale-appropriate search engine
    return industryCompetitors.map((c) => ({ ...c, searchEngine }));
  }

  /**
   * Analyzes competitors separately for each locale.
   * Returns a Map of locale → competitors for multi-locale businesses.
   *
   * Requirement 5.2
   */
  async analyzeMultiLocale(
    locales: string[],
    industry: string,
  ): Promise<Map<string, Competitor[]>> {
    const results = new Map<string, Competitor[]>();

    for (const locale of locales) {
      const competitors = await this.identifyCompetitors(locale, industry);
      results.set(locale, competitors);
    }

    return results;
  }

  /**
   * Returns locale-specific metrics for a competitor, including rankings
   * in the locale-appropriate search engine.
   *
   * Requirement 5.3
   */
  async getLocaleSpecificMetrics(
    competitor: Competitor,
    locale: string,
  ): Promise<LocaleMetrics> {
    const searchEngine = this.searchEngineAdapter.getCompetitorAnalysisEngine(locale);
    const visibilityData = this.searchEngineAdapter.getSearchVisibilityMetrics(locale);

    // Derive a deterministic but plausible ranking position from the domain name
    // (in production this would come from a real search API)
    const rankingPosition = this.estimateRankingPosition(competitor.domain, locale);
    const searchVisibilityScore = this.estimateVisibilityScore(competitor.domain, locale);

    return {
      locale,
      searchEngine,
      rankingPosition,
      searchVisibilityScore,
      organicKeywords: this.estimateOrganicKeywords(competitor.domain),
      estimatedMonthlyTraffic: this.estimateMonthlyTraffic(competitor.domain),
      topKeywords: this.deriveTopKeywords(competitor, locale, visibilityData.primaryEngine),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers (deterministic estimates for use without a live search API)
  // ---------------------------------------------------------------------------

  private estimateRankingPosition(domain: string, locale: string): number | null {
    if (!domain) return null;
    // Simple hash-based position in range 1–20
    const hash = this.simpleHash(domain + locale);
    return (hash % 20) + 1;
  }

  private estimateVisibilityScore(domain: string, locale: string): number {
    const hash = this.simpleHash(domain + locale + 'visibility');
    // Score between 0.1 and 1.0
    return Math.round(((hash % 90) + 10)) / 100;
  }

  private estimateOrganicKeywords(domain: string): number {
    const hash = this.simpleHash(domain + 'keywords');
    return (hash % 500) + 50;
  }

  private estimateMonthlyTraffic(domain: string): number {
    const hash = this.simpleHash(domain + 'traffic');
    return ((hash % 9000) + 1000);
  }

  private deriveTopKeywords(
    competitor: Competitor,
    locale: string,
    searchEngine: string,
  ): string[] {
    return [
      `${competitor.industry} ${locale}`,
      `${competitor.industry} ${searchEngine}`,
      `${competitor.name} ${competitor.industry}`,
    ];
  }

  /** Deterministic integer hash of a string. */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
  }
}
