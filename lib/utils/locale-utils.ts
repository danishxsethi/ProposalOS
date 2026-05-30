/**
 * Locale Utilities
 *
 * Provides utilities for locale detection, RTL support, and date/time formatting.
 */

// RTL Languages
export const RTL_LOCALES = ['ar-SA', 'he-IL', 'fa-IR', 'ur-PK'];

/**
 * Check if a locale is RTL (Right-to-Left)
 */
export function isRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Get the text direction for a locale
 */
export function getTextDirection(locale: string): 'ltr' | 'rtl' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

/**
 * Detect locale from various sources
 * Priority: manual override > domain TLD > Accept-Language header > IP geolocation > default
 */
export interface LocaleDetectionOptions {
  /** Manual override (e.g., from query param ?locale=de-DE) */
  override?: string;
  /** Domain TLD (e.g., '.de' from example.de) */
  domainTld?: string;
  /** Accept-Language header from request */
  acceptLanguage?: string;
  /** IP address for geolocation */
  ipAddress?: string;
  /** Default locale if detection fails */
  defaultLocale?: string;
}

export function detectLocale(options: LocaleDetectionOptions): string {
  // 1. Manual override takes priority
  if (options.override) {
    return normalizeLocale(options.override);
  }

  // 2. Domain TLD detection
  if (options.domainTld) {
    const tldLocale = tldToLocale(options.domainTld);
    if (tldLocale) {
      return tldLocale;
    }
  }

  // 3. Accept-Language header parsing
  if (options.acceptLanguage) {
    const headerLocale = parseAcceptLanguage(options.acceptLanguage);
    if (headerLocale) {
      return headerLocale;
    }
  }

  // 4. IP geolocation (simplified - would use a geolocation service in production)
  if (options.ipAddress) {
    const geoLocale = ipToLocale(options.ipAddress);
    if (geoLocale) {
      return geoLocale;
    }
  }

  // 5. Default fallback
  return options.defaultLocale || 'en-US';
}

/**
 * Normalize locale string to standard format
 */
export function normalizeLocale(locale: string): string {
  const normalized = locale.toLowerCase().trim();

  // Handle common variations
  const localeMap: Record<string, string> = {
    en: 'en-US',
    'en-us': 'en-US',
    en_gb: 'en-GB',
    'en-gb': 'en-GB',
    en_ca: 'en-CA',
    'en-ca': 'en-CA',
    en_au: 'en-AU',
    'en-au': 'en-AU',
    de: 'de-DE',
    de_de: 'de-DE',
    'de-de': 'de-DE',
    fr: 'fr-FR',
    fr_fr: 'fr-FR',
    'fr-fr': 'fr-FR',
    es: 'es-ES',
    es_es: 'es-ES',
    'es-es': 'es-ES',
    ar: 'ar-SA',
    ar_sa: 'ar-SA',
    'ar-sa': 'ar-SA',
    he: 'he-IL',
    he_il: 'he-IL',
    'he-il': 'he-IL',
  };

  return localeMap[normalized] || locale;
}

/**
 * Convert TLD to locale
 */
export function tldToLocale(tld: string): string | null {
  const tldMap: Record<string, string> = {
    '.us': 'en-US',
    '.com': 'en-US',
    '.uk': 'en-GB',
    '.co.uk': 'en-GB',
    '.ca': 'en-CA',
    '.au': 'en-AU',
    '.com.au': 'en-AU',
    '.de': 'de-DE',
    '.fr': 'fr-FR',
    '.es': 'es-ES',
    '.com.es': 'es-ES',
    '.sa': 'ar-SA',
    '.ae': 'ar-SA',
    '.il': 'he-IL',
  };

  return tldMap[tld.toLowerCase()] || null;
}

/**
 * Parse Accept-Language header and return best match
 */
export function parseAcceptLanguage(header: string): string | null {
  if (!header) return null;

  const languages = header.split(',').map((lang) => {
    const parts = lang.trim().split(';');
    const locale = parts[0]?.trim() || '';
    const quality = parts[1] || 'q=1';
    const qualityValue = quality.split('=')[1];
    return {
      locale,
      quality: parseFloat(qualityValue ?? '1') || 1,
    };
  });

  // Sort by quality (highest first)
  languages.sort((a, b) => b.quality - a.quality);

  // Return the best match from supported locales
  const supportedLocales = [
    'en-US',
    'en-GB',
    'en-CA',
    'en-AU',
    'de-DE',
    'fr-FR',
    'es-ES',
    'ar-SA',
    'he-IL',
  ];

  for (const { locale } of languages) {
    const normalized = normalizeLocale(locale);
    if (supportedLocales.includes(normalized)) {
      return normalized;
    }
  }

  return null;
}

/**
 * Simple IP to locale mapping (in production, use a geolocation service)
 */
export function ipToLocale(ip: string): string | null {
  // This is a simplified placeholder
  // In production, use a service like MaxMind GeoIP2
  // For now, return null to fall back to default
  return null;
}

/**
 * Format date according to locale
 */
export function formatDate(
  date: Date | string | number,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(dateObj);
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date | string | number, locale: string): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    return rtf.format(diffHours, 'hour');
  } else if (Math.abs(diffDays) < 7) {
    return rtf.format(diffDays, 'day');
  } else if (Math.abs(diffDays) < 30) {
    const diffWeeks = Math.round(diffDays / 7);
    return rtf.format(diffWeeks, 'week');
  } else if (Math.abs(diffDays) < 365) {
    const diffMonths = Math.round(diffDays / 30);
    return rtf.format(diffMonths, 'month');
  } else {
    const diffYears = Math.round(diffDays / 365);
    return rtf.format(diffYears, 'year');
  }
}

/**
 * Format number according to locale
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format currency according to locale
 */
export function formatCurrency(amount: number, locale: string, currency?: string): string {
  const currencyCode = currency || getCurrencyForLocale(locale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}

/**
 * Get currency code for a locale
 */
export function getCurrencyForLocale(locale: string): string {
  const currencyMap: Record<string, string> = {
    'en-US': 'USD',
    'en-GB': 'GBP',
    'en-CA': 'CAD',
    'en-AU': 'AUD',
    'de-DE': 'EUR',
    'fr-FR': 'EUR',
    'es-ES': 'EUR',
    'ar-SA': 'SAR',
    'he-IL': 'ILS',
  };

  return currencyMap[locale] || 'USD';
}

/**
 * Get supported locales
 */
export function getSupportedLocales(): string[] {
  return ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES', 'ar-SA', 'he-IL'];
}

/**
 * Get locale display name
 */
export function getLocaleDisplayName(locale: string): string {
  const displayNames: Record<string, string> = {
    'en-US': 'English (United States)',
    'en-GB': 'English (United Kingdom)',
    'en-CA': 'English (Canada)',
    'en-AU': 'English (Australia)',
    'de-DE': 'Deutsch (Deutschland)',
    'fr-FR': 'Français (France)',
    'es-ES': 'Español (España)',
    'ar-SA': 'العربية (المملكة العربية السعودية)',
    'he-IL': 'עברית (ישראל)',
  };

  return displayNames[locale] || locale;
}
