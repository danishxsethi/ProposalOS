/**
 * LocaleDetector: Auto-detects user locale from multiple signals with manual override capability
 * 
 * Detection Priority Chain:
 * 1. Manual override parameter (?locale=de-DE)
 * 2. Domain TLD (.de → de-DE)
 * 3. hreflang tags in HTML
 * 4. GBP location
 * 5. IP geolocation
 * 6. Default to en-US
 */

import {
  LocaleDetectionResult,
  LocaleConfig,
  DetectionContext,
} from './types';

export class LocaleDetector {
  private localeConfigs: Map<string, LocaleConfig> = new Map();
  private supportedLocales: string[] = [
    'en-US',
    'en-GB',
    'en-CA',
    'en-AU',
    'de-DE',
    'fr-FR',
    'es-ES',
  ];

  // TLD to locale mapping
  private tldToLocaleMap: Map<string, string> = new Map([
    ['us', 'en-US'],
    ['uk', 'en-GB'],
    ['ca', 'en-CA'],
    ['au', 'en-AU'],
    ['de', 'de-DE'],
    ['fr', 'fr-FR'],
    ['es', 'es-ES'],
  ]);

  // IP geolocation mapping (simplified for demo)
  private ipToLocaleMap: Map<string, string> = new Map([
    ['1.1.1.1', 'en-US'], // Example IPs
    ['8.8.8.8', 'en-US'],
    ['2.2.2.2', 'en-GB'],
    ['3.3.3.3', 'de-DE'],
  ]);

  constructor() {
    this.initializeLocaleConfigs();
  }

  /**
   * Initialize locale configurations
   */
  private initializeLocaleConfigs(): void {
    const configs: LocaleConfig[] = [
      {
        locale: 'en-US',
        language: 'English (US)',
        primarySearchEngine: 'google',
        currency: 'USD',
        regulations: [],
        tone: 'casual',
        benchmarkCohorts: ['en-US'],
      },
      {
        locale: 'en-GB',
        language: 'English (UK)',
        primarySearchEngine: 'google',
        currency: 'GBP',
        regulations: ['GDPR'],
        tone: 'formal',
        benchmarkCohorts: ['en-GB'],
      },
      {
        locale: 'en-CA',
        language: 'English (Canada)',
        primarySearchEngine: 'google',
        currency: 'CAD',
        regulations: ['PIPEDA'],
        tone: 'professional',
        benchmarkCohorts: ['en-CA'],
      },
      {
        locale: 'en-AU',
        language: 'English (Australia)',
        primarySearchEngine: 'google',
        currency: 'AUD',
        regulations: ['Privacy Act'],
        tone: 'casual',
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

    configs.forEach((config) => {
      this.localeConfigs.set(config.locale, config);
    });
  }

  /**
   * Main detection method: Detects locale from multiple signals with priority chain
   * Priority: manual override > TLD > hreflang > GBP > IP geolocation > default
   */
  async detectLocale(context: DetectionContext): Promise<LocaleDetectionResult> {
    const fallbackChain: string[] = [];

    // 1. Check manual override (highest priority)
    if (context.manualOverride) {
      const validated = await this.validateLocale(context.manualOverride);
      if (validated) {
        fallbackChain.push(context.manualOverride);
        return {
          detectedLocale: context.manualOverride,
          detectionMethod: 'manual_override',
          confidence: 1.0,
          fallbackChain,
        };
      }
    }

    // 2. Try TLD extraction
    if (context.domain) {
      const tldLocale = this.extractLocaleFromTLD(context.domain);
      if (tldLocale) {
        fallbackChain.push(tldLocale);
        return {
          detectedLocale: tldLocale,
          detectionMethod: 'tld',
          confidence: 0.8,
          fallbackChain,
        };
      }
    }

    // 3. Try hreflang tag parsing
    if (context.htmlContent) {
      const hreflangLocale = this.parseHreflangTags(context.htmlContent);
      if (hreflangLocale) {
        fallbackChain.push(hreflangLocale);
        return {
          detectedLocale: hreflangLocale,
          detectionMethod: 'hreflang',
          confidence: 0.7,
          fallbackChain,
        };
      }
    }

    // 4. Try GBP location lookup
    if (context.gbpLocation) {
      const gbpLocale = this.lookupGBPLocation(context.gbpLocation);
      if (gbpLocale) {
        fallbackChain.push(gbpLocale);
        return {
          detectedLocale: gbpLocale,
          detectionMethod: 'gbp',
          confidence: 0.75,
          fallbackChain,
        };
      }
    }

    // 5. Try IP geolocation
    if (context.ipAddress) {
      const ipLocale = this.geolocateIP(context.ipAddress);
      if (ipLocale) {
        fallbackChain.push(ipLocale);
        return {
          detectedLocale: ipLocale,
          detectionMethod: 'ip_geolocation',
          confidence: 0.6,
          fallbackChain,
        };
      }
    }

    // 6. Default to en-US
    fallbackChain.push('en-US');
    return {
      detectedLocale: 'en-US',
      detectionMethod: 'default',
      confidence: 0.5,
      fallbackChain,
    };
  }

  /**
   * Extract locale from domain TLD
   * Example: example.de → de-DE
   */
  private extractLocaleFromTLD(domain: string): string | null {
    try {
      // Extract TLD from domain
      const parts = domain.split('.');
      if (parts.length < 2) {
        return null;
      }

      const tld = parts[parts.length - 1].toLowerCase();

      // Look up TLD in mapping
      const locale = this.tldToLocaleMap.get(tld);
      return locale || null;
    } catch (error) {
      console.error('Error extracting TLD:', error);
      return null;
    }
  }

  /**
   * Parse hreflang tags from HTML content
   * Example: <link rel="alternate" hreflang="de-DE" href="..." />
   */
  private parseHreflangTags(htmlContent: string): string | null {
    try {
      // Regex to find hreflang attribute values - case insensitive for attribute name
      const hreflangRegex = /hreflang\s*=\s*["']([^"']+)["']/gi;
      let match;

      while ((match = hreflangRegex.exec(htmlContent)) !== null) {
        const hreflang = match[1];
        // Normalize to lowercase for comparison, but keep original case for supported locales check
        const hreflangLower = hreflang.toLowerCase();

        // Check if it's a supported locale (case-insensitive)
        const supportedMatch = this.supportedLocales.find(
          (locale) => locale.toLowerCase() === hreflangLower
        );
        if (supportedMatch) {
          return supportedMatch;
        }

        // Try to normalize (e.g., de → de-DE)
        const normalized = this.normalizeLocale(hreflangLower);
        if (normalized && this.supportedLocales.includes(normalized)) {
          return normalized;
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing hreflang tags:', error);
      return null;
    }
  }

  /**
   * Look up locale from GBP location
   * In a real implementation, this would query Google Business Profile API
   */
  private lookupGBPLocation(gbpLocation: string): string | null {
    try {
      // Simplified mapping of GBP locations to locales
      const gbpToLocaleMap: Map<string, string> = new Map([
        ['Germany', 'de-DE'],
        ['France', 'fr-FR'],
        ['Spain', 'es-ES'],
        ['United Kingdom', 'en-GB'],
        ['Canada', 'en-CA'],
        ['Australia', 'en-AU'],
        ['United States', 'en-US'],
      ]);

      const locale = gbpToLocaleMap.get(gbpLocation);
      return locale || null;
    } catch (error) {
      console.error('Error looking up GBP location:', error);
      return null;
    }
  }

  /**
   * Geolocate IP address to determine locale
   * In a real implementation, this would use a geolocation service
   */
  private geolocateIP(ipAddress: string): string | null {
    try {
      // Check if IP is in our mapping
      const locale = this.ipToLocaleMap.get(ipAddress);
      if (locale) {
        return locale;
      }

      // In a real implementation, this would call a geolocation API
      // For now, return null to fall back to default
      return null;
    } catch (error) {
      console.error('Error geolocating IP:', error);
      return null;
    }
  }

  /**
   * Normalize locale string (e.g., de → de-DE, en-gb → en-GB)
   */
  private normalizeLocale(locale: string): string | null {
    const normalized = locale.toLowerCase();

    // If it's already a full locale code, return it
    if (this.supportedLocales.includes(normalized)) {
      return normalized;
    }

    // Try to expand short codes (e.g., de → de-DE)
    const shortToFullMap: Map<string, string> = new Map([
      ['en', 'en-US'],
      ['de', 'de-DE'],
      ['fr', 'fr-FR'],
      ['es', 'es-ES'],
    ]);

    return shortToFullMap.get(normalized) || null;
  }

  /**
   * Retrieve locale configuration
   */
  async getLocaleConfig(locale: string): Promise<LocaleConfig | null> {
    return this.localeConfigs.get(locale) || null;
  }

  /**
   * Validate if locale is supported
   */
  async validateLocale(locale: string): Promise<boolean> {
    return this.supportedLocales.includes(locale);
  }

  /**
   * Get list of all supported locales
   */
  async getSupportedLocales(): Promise<string[]> {
    return [...this.supportedLocales];
  }
}
