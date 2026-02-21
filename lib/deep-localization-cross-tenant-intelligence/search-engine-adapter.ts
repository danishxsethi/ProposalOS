/**
 * SearchEngineAdapter
 *
 * Implements locale-to-search-engine mapping and search engine-specific
 * guidance generation for the Deep Localization + Cross-Tenant Intelligence feature.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

// ---------------------------------------------------------------------------
// Locale → Primary Search Engine Mapping
// ---------------------------------------------------------------------------

/**
 * Maps locales with dominant non-Google search engines to their primary engine.
 * All other locales default to Google.
 */
const LOCALE_SEARCH_ENGINE_MAP: Record<string, string> = {
  'ru-RU': 'Yandex',
  'zh-CN': 'Baidu',
  'ko-KR': 'Naver',
  'ja-JP': 'Yahoo Japan',
};

const DEFAULT_SEARCH_ENGINE = 'Google';

// ---------------------------------------------------------------------------
// Search Engine-Specific Guidance Templates
// ---------------------------------------------------------------------------

const SEARCH_ENGINE_GUIDANCE: Record<string, Record<string, string>> = {
  Yandex: {
    schema: 'Implement Yandex-compatible structured data using Schema.org markup. Yandex supports JSON-LD and Microdata formats and has specific requirements for local business schema.',
    meta: 'Optimize meta tags for Yandex: use concise, keyword-rich titles (up to 70 characters) and descriptions (up to 200 characters) that align with Yandex ranking signals.',
    content: 'Create content optimized for Yandex ranking factors: prioritize text quality, keyword density, and Yandex Metrica engagement signals.',
    performance: 'Improve page speed for Yandex PageSpeed requirements. Yandex Webmaster Tools provides specific performance insights for Russian-market optimization.',
    default: 'Optimize this recommendation for Yandex, the primary search engine in the Russian market. Follow Yandex Webmaster guidelines for best results.',
  },
  Baidu: {
    schema: 'Implement Baidu-compatible structured data. Baidu has its own schema requirements and supports Open Graph tags for rich snippets in Chinese search results.',
    meta: 'Optimize meta tags for Baidu: use Simplified Chinese keywords, keep titles under 30 Chinese characters, and descriptions under 80 Chinese characters.',
    content: 'Create content optimized for Baidu ranking factors: prioritize original Chinese-language content, ICP license compliance, and Baidu-specific keyword research.',
    performance: 'Improve page speed for Baidu crawlers. Host content on servers within China or use a CDN with Chinese PoPs to reduce latency for Baidu indexing.',
    default: 'Optimize this recommendation for Baidu, the primary search engine in the Chinese market. Ensure ICP license compliance and follow Baidu Webmaster guidelines.',
  },
  Naver: {
    schema: 'Implement Naver-compatible structured data. Naver uses its own indexing system (Naver Search Advisor) and supports specific schema types for Korean business listings.',
    meta: 'Optimize meta tags for Naver: use Korean-language keywords, keep titles concise, and ensure Open Graph tags are properly configured for Naver sharing.',
    content: 'Create content optimized for Naver ranking factors: prioritize Korean-language content, Naver Blog integration, and engagement signals from Naver users.',
    performance: 'Improve page speed for Naver crawlers. Register your site with Naver Search Advisor and submit a sitemap for optimal indexing in Korean search results.',
    default: 'Optimize this recommendation for Naver, the primary search engine in the Korean market. Register with Naver Search Advisor and follow Naver Webmaster guidelines.',
  },
  'Yahoo Japan': {
    schema: 'Implement structured data compatible with Yahoo Japan search. Yahoo Japan uses Google\'s search index but has additional requirements for Yahoo Japan-specific features like Yahoo! Shopping integration.',
    meta: 'Optimize meta tags for Yahoo Japan: use Japanese-language keywords and ensure proper encoding for Japanese characters in titles and descriptions.',
    content: 'Create content optimized for Yahoo Japan: prioritize Japanese-language content quality, Yahoo Japan News integration opportunities, and local Japanese market relevance.',
    performance: 'Improve page speed for Yahoo Japan users. Yahoo Japan shares Google\'s core ranking signals but also considers Yahoo Japan-specific engagement metrics.',
    default: 'Optimize this recommendation for Yahoo Japan, the primary search engine in the Japanese market. Follow Yahoo Japan Webmaster guidelines alongside Google best practices.',
  },
  Google: {
    schema: 'Implement Google-compatible structured data using Schema.org JSON-LD format. Use Google\'s Rich Results Test to validate your markup.',
    meta: 'Optimize meta tags for Google: use descriptive titles (50-60 characters) and compelling descriptions (150-160 characters) that improve click-through rates.',
    content: 'Create content optimized for Google ranking factors: prioritize E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) and user intent alignment.',
    performance: 'Improve Core Web Vitals scores for Google ranking. Use Google PageSpeed Insights and Search Console to identify and fix performance issues.',
    default: 'Optimize this recommendation following Google Search Central guidelines and best practices for improved visibility in Google search results.',
  },
};

// ---------------------------------------------------------------------------
// SearchEngineAdapter Class
// ---------------------------------------------------------------------------

export class SearchEngineAdapter {
  /**
   * Returns the primary search engine for a given locale.
   *
   * Mapping:
   *   ru-RU → Yandex
   *   zh-CN → Baidu
   *   ko-KR → Naver
   *   ja-JP → Yahoo Japan
   *   all others → Google
   *
   * Requirement 3.1
   */
  getPrimarySearchEngine(locale: string): string {
    return LOCALE_SEARCH_ENGINE_MAP[locale] ?? DEFAULT_SEARCH_ENGINE;
  }

  /**
   * Generates search engine-specific guidance for a recommendation in the given locale.
   *
   * The returned guidance text references the locale-appropriate search engine by name.
   *
   * Requirement 3.2
   */
  generateSearchEngineGuidance(
    recommendation: { type: string; description: string },
    locale: string,
  ): string {
    const engine = this.getPrimarySearchEngine(locale);
    const engineGuidance = SEARCH_ENGINE_GUIDANCE[engine] ?? SEARCH_ENGINE_GUIDANCE[DEFAULT_SEARCH_ENGINE];

    // Match recommendation type to a guidance category
    const type = recommendation.type.toLowerCase();
    let guidance: string;

    if (type.includes('schema') || type.includes('structured')) {
      guidance = engineGuidance.schema;
    } else if (type.includes('meta') || type.includes('title') || type.includes('description')) {
      guidance = engineGuidance.meta;
    } else if (type.includes('content') || type.includes('keyword')) {
      guidance = engineGuidance.content;
    } else if (type.includes('performance') || type.includes('speed') || type.includes('core_web')) {
      guidance = engineGuidance.performance;
    } else {
      guidance = engineGuidance.default;
    }

    return `[${engine}] ${guidance}`;
  }

  /**
   * Returns the search engine to use for competitor analysis in the given locale.
   *
   * Uses the same engine as the primary search engine for the locale.
   *
   * Requirement 3.3
   */
  getCompetitorAnalysisEngine(locale: string): string {
    return this.getPrimarySearchEngine(locale);
  }

  /**
   * Returns search visibility metrics with the locale-appropriate primary engine.
   *
   * Requirement 3.4
   */
  getSearchVisibilityMetrics(locale: string): { primaryEngine: string; metrics: string[] } {
    const engine = this.getPrimarySearchEngine(locale);

    const baseMetrics = [
      `${engine} search ranking position`,
      `${engine} organic click-through rate`,
      `${engine} impressions`,
      `${engine} indexed pages`,
    ];

    // Add engine-specific metrics
    const engineSpecificMetrics: Record<string, string[]> = {
      Yandex: ['Yandex Metrica engagement score', 'Yandex Webmaster crawl coverage'],
      Baidu: ['Baidu Webmaster crawl frequency', 'Baidu mobile search visibility'],
      Naver: ['Naver Search Advisor indexing status', 'Naver Blog integration score'],
      'Yahoo Japan': ['Yahoo Japan Shopping integration', 'Yahoo Japan News visibility'],
      Google: ['Google Search Console coverage', 'Core Web Vitals score'],
    };

    const additionalMetrics = engineSpecificMetrics[engine] ?? engineSpecificMetrics[DEFAULT_SEARCH_ENGINE];

    return {
      primaryEngine: engine,
      metrics: [...baseMetrics, ...additionalMetrics],
    };
  }
}
