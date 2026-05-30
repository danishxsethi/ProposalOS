/**
 * Search Engine Adapters
 *
 * Provides adapters for different search engines based on locale:
 * - Google (default, global)
 * - Yandex (Russia, CIS)
 * - Baidu (China)
 * - Naver (South Korea)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 11.1
 */

import { logger } from '@/lib/logger';

import { LocaleConfig } from './types';

// Search engine types
export type SearchEngineType = 'google' | 'yandex' | 'baidu' | 'naver';

// Search result interface
export interface SearchResult {
  title: string;
  url: string;
  description: string;
  position: number;
  snippet?: string;
}

// Search options
export interface SearchOptions {
  query: string;
  locale: string;
  numResults?: number;
  language?: string;
  region?: string;
}

/**
 * Base search engine adapter interface
 */
export interface SearchEngineAdapter {
  /**
   * Search the web and return results
   */
  search(options: SearchOptions): Promise<SearchResult[]>;

  /**
   * Get the base URL for the search engine
   */
  getBaseUrl(): string;

  /**
   * Format a search URL for manual verification
   */
  formatSearchUrl(query: string, locale: string): string;

  /**
   * Get the search engine name
   */
  getName(): string;

  /**
   * Check if this engine is available for a locale
   */
  isAvailable(locale: string): boolean;
}

/**
 * Google Search Adapter
 * Default for most locales
 */
export class GoogleSearchAdapter implements SearchEngineAdapter {
  private apiKey: string;
  private cx: string; // Custom Search Engine ID

  constructor(apiKey?: string, cx?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_SEARCH_API_KEY || '';
    this.cx = cx || process.env.GOOGLE_SEARCH_CX || '';
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey || !this.cx) {
      // Fallback to returning empty results if API not configured
      logger.warn('[GoogleSearchAdapter] API credentials not configured');
      return [];
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.append('key', this.apiKey);
    url.searchParams.append('cx', this.cx);
    url.searchParams.append('q', options.query);
    url.searchParams.append('num', String(options.numResults || 10));
    url.searchParams.append('gl', this.getRegionForLocale(options.locale));
    url.searchParams.append('lr', `lang_${this.getLanguageForLocale(options.locale)}`);

    try {
      const response = await fetch(url.toString());
      const data = await response.json();

      return (data.items || []).map((item: any, index: number) => ({
        title: item.title,
        url: item.link,
        description: item.snippet,
        position: index + 1,
        snippet: item.snippet,
      }));
    } catch (error) {
      logger.error({ error }, '[GoogleSearchAdapter] Search failed');
      return [];
    }
  }

  getBaseUrl(): string {
    return 'https://www.google.com';
  }

  formatSearchUrl(query: string, locale: string): string {
    const region = this.getRegionForLocale(locale);
    return `https://www.google.com/search?q=${encodeURIComponent(query)}&gl=${region}`;
  }

  getName(): string {
    return 'Google';
  }

  isAvailable(): boolean {
    return true; // Google is available globally
  }

  private getRegionForLocale(locale: string): string {
    const regionMap: Record<string, string> = {
      'en-US': 'us',
      'en-GB': 'uk',
      'en-CA': 'ca',
      'en-AU': 'au',
      'de-DE': 'de',
      'fr-FR': 'fr',
      'es-ES': 'es',
      'ar-SA': 'sa',
      'he-IL': 'il',
    };
    return regionMap[locale] || 'us';
  }

  private getLanguageForLocale(locale: string): string {
    const langMap: Record<string, string> = {
      'en-US': 'en',
      'en-GB': 'en',
      'en-CA': 'en',
      'en-AU': 'en',
      'de-DE': 'de',
      'fr-FR': 'fr',
      'es-ES': 'es',
      'ar-SA': 'ar',
      'he-IL': 'he',
    };
    return langMap[locale] || 'en';
  }
}

/**
 * Yandex Search Adapter
 * For Russian and CIS markets
 */
export class YandexSearchAdapter implements SearchEngineAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.YANDEX_SEARCH_API_KEY || '';
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) {
      logger.warn('[YandexSearchAdapter] API key not configured');
      return [];
    }

    const url = new URL('https://yandex.com/searchapi/v1/search');
    url.searchParams.append('apikey', this.apiKey);
    url.searchParams.append('text', options.query);
    url.searchParams.append('lr', this.getRegionId(options.locale));

    try {
      const response = await fetch(url.toString());
      const data = await response.json();

      return (data.results || []).map((item: any, index: number) => ({
        title: item.title,
        url: item.url,
        description: item.description,
        position: index + 1,
        snippet: item.snippet,
      }));
    } catch (error) {
      logger.error({ error }, '[YandexSearchAdapter] Search failed');
      return [];
    }
  }

  getBaseUrl(): string {
    return 'https://yandex.com';
  }

  formatSearchUrl(query: string, locale: string): string {
    return `https://yandex.com/search/?text=${encodeURIComponent(query)}`;
  }

  getName(): string {
    return 'Yandex';
  }

  isAvailable(locale: string): boolean {
    // Yandex is primary for Russian locales
    return (
      locale.startsWith('ru') || locale === 'uk-UA' || locale === 'kk-KZ' || locale === 'be-BY'
    );
  }

  private getRegionId(locale: string): string {
    const regionMap: Record<string, string> = {
      'ru-RU': '213', // Moscow
      'uk-UA': '229', // Kiev
      'kk-KZ': '248', // Almaty
      'be-BY': '250', // Minsk
    };
    return regionMap[locale] || '213';
  }
}

/**
 * Baidu Search Adapter
 * For Chinese market
 */
export class BaiduSearchAdapter implements SearchEngineAdapter {
  private apiKey: string;
  private secretKey: string;

  constructor(apiKey?: string, secretKey?: string) {
    this.apiKey = apiKey || process.env.BAIDU_SEARCH_API_KEY || '';
    this.secretKey = secretKey || process.env.BAIDU_SEARCH_SECRET_KEY || '';
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey || !this.secretKey) {
      logger.warn('[BaiduSearchAdapter] API credentials not configured');
      return [];
    }

    // Baidu API requires authentication with access token
    // This is a simplified implementation
    const url = new URL('https://aip.baidubce.com/rest/2.0/search/v1');
    url.searchParams.append('access_token', await this.getAccessToken());
    url.searchParams.append('query', options.query);
    url.searchParams.append('region', this.getRegionCode(options.locale));

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();

      return (data.result || []).map((item: any, index: number) => ({
        title: item.title,
        url: item.url,
        description: item.abstract,
        position: index + 1,
        snippet: item.abstract,
      }));
    } catch (error) {
      logger.error({ error }, '[BaiduSearchAdapter] Search failed');
      return [];
    }
  }

  getBaseUrl(): string {
    return 'https://www.baidu.com';
  }

  formatSearchUrl(query: string, locale: string): string {
    return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  }

  getName(): string {
    return 'Baidu';
  }

  isAvailable(locale: string): boolean {
    return locale.startsWith('zh');
  }

  private getRegionCode(locale: string): string {
    const regionMap: Record<string, string> = {
      'zh-CN': 'cn',
      'zh-TW': 'tw',
      'zh-HK': 'hk',
    };
    return regionMap[locale] || 'cn';
  }

  private async getAccessToken(): Promise<string> {
    // Simplified - in production, implement proper OAuth flow
    return this.apiKey;
  }
}

/**
 * Naver Search Adapter
 * For South Korean market
 */
export class NaverSearchAdapter implements SearchEngineAdapter {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.NAVER_SEARCH_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.NAVER_SEARCH_CLIENT_SECRET || '';
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.clientId || !this.clientSecret) {
      logger.warn('[NaverSearchAdapter] API credentials not configured');
      return [];
    }

    const url = new URL('https://openapi.naver.com/v1/search/web.json');
    url.searchParams.append('query', options.query);
    url.searchParams.append('display', String(options.numResults || 10));
    url.searchParams.append('start', '1');

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      const data = await response.json();

      return (data.items || []).map((item: any, index: number) => ({
        title: this.stripHtml(item.title),
        url: item.link,
        description: this.stripHtml(item.description),
        position: index + 1,
        snippet: this.stripHtml(item.description),
      }));
    } catch (error) {
      logger.error({ error }, '[NaverSearchAdapter] Search failed');
      return [];
    }
  }

  getBaseUrl(): string {
    return 'https://search.naver.com';
  }

  formatSearchUrl(query: string, locale: string): string {
    return `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
  }

  getName(): string {
    return 'Naver';
  }

  isAvailable(locale: string): boolean {
    return locale === 'ko-KR' || locale.startsWith('ko');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Search Engine Factory
 * Returns the appropriate search engine adapter for a locale
 */
export class SearchEngineFactory {
  private adapters: Map<SearchEngineType, SearchEngineAdapter>;
  private defaultType: SearchEngineType = 'google';

  constructor() {
    this.adapters = new Map();
    this.adapters.set('google', new GoogleSearchAdapter());
    this.adapters.set('yandex', new YandexSearchAdapter());
    this.adapters.set('baidu', new BaiduSearchAdapter());
    this.adapters.set('naver', new NaverSearchAdapter());
  }

  /**
   * Get the appropriate search engine for a locale
   */
  getAdapter(locale: string): SearchEngineAdapter {
    // Check for locale-specific search engines
    if (locale.startsWith('zh')) {
      const baidu = this.adapters.get('baidu')!;
      if (baidu.isAvailable(locale)) return baidu;
    }

    if (locale.startsWith('ko') || locale === 'ko-KR') {
      const naver = this.adapters.get('naver')!;
      if (naver.isAvailable(locale)) return naver;
    }

    if (locale.startsWith('ru') || locale === 'uk-UA' || locale === 'kk-KZ' || locale === 'be-BY') {
      const yandex = this.adapters.get('yandex')!;
      if (yandex.isAvailable(locale)) return yandex;
    }

    // Default to Google
    return this.adapters.get('google')!;
  }

  /**
   * Get adapter by type
   */
  getAdapterByType(type: SearchEngineType): SearchEngineAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Get all available adapters
   */
  getAllAdapters(): Map<SearchEngineType, SearchEngineAdapter> {
    return new Map(this.adapters);
  }

  /**
   * Set custom adapter
   */
  setAdapter(type: SearchEngineType, adapter: SearchEngineAdapter): void {
    this.adapters.set(type, adapter);
  }
}

/**
 * Get search engine configuration for locale from LocaleConfig
 */
export function getSearchEngineForLocale(
  locale: string,
  localeConfig?: LocaleConfig
): SearchEngineType {
  if (localeConfig?.primarySearchEngine) {
    return localeConfig.primarySearchEngine;
  }

  // Default mapping based on locale
  if (locale.startsWith('zh')) return 'baidu';
  if (locale.startsWith('ko')) return 'naver';
  if (locale.startsWith('ru') || locale === 'uk-UA') return 'yandex';

  return 'google';
}

// Export factory instance
export const searchEngineFactory = new SearchEngineFactory();
