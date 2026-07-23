/**
 * Unit tests for LocaleDetector class
 * 
 * Tests specific examples and edge cases for locale detection
 */

import { LocaleDetector } from '../locale-detector';
import { DetectionContext, LocaleDetectionResult } from '../types';

describe('LocaleDetector', () => {
  let detector: LocaleDetector;

  beforeEach(() => {
    detector = new LocaleDetector();
  });

  describe('detectLocale', () => {
    describe('Manual Override (Priority 1)', () => {
      it('should return manual override locale when provided', async () => {
        const context: DetectionContext = {
          manualOverride: 'de-DE',
          domain: 'example.com',
          htmlContent: '<html></html>',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('manual_override');
        expect(result.confidence).toBe(1.0);
      });

      it('should ignore other signals when manual override is provided', async () => {
        const context: DetectionContext = {
          manualOverride: 'fr-FR',
          domain: 'example.de', // Would normally detect de-DE
          htmlContent: '<link rel="alternate" hreflang="en-US" />', // Would normally detect en-US
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('fr-FR');
        expect(result.detectionMethod).toBe('manual_override');
      });

      it('should reject invalid manual override locale', async () => {
        const context: DetectionContext = {
          manualOverride: 'invalid-locale',
          domain: 'example.de',
        };

        const result = await detector.detectLocale(context);

        // Should fall back to TLD detection
        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('tld');
      });
    });

    describe('TLD Detection (Priority 2)', () => {
      it('should detect locale from .de TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.de',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('tld');
        expect(result.confidence).toBe(0.8);
      });

      it('should detect locale from .uk TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.uk',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-GB');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should detect locale from .ca TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.ca',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-CA');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should detect locale from .au TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.au',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-AU');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should detect locale from .fr TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.fr',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('fr-FR');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should detect locale from .es TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.es',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('es-ES');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should detect locale from .us TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.us',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should handle multi-level TLDs', async () => {
        const context: DetectionContext = {
          domain: 'example.co.uk',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-GB');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should return null for unsupported TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.jp',
        };

        const result = await detector.detectLocale(context);

        // Should fall back to default
        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
      });
    });

    describe('hreflang Detection (Priority 3)', () => {
      it('should detect locale from hreflang tag', async () => {
        const context: DetectionContext = {
          htmlContent: '<link rel="alternate" hreflang="de-DE" href="https://example.de" />',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('hreflang');
        expect(result.confidence).toBe(0.7);
      });

      it('should detect locale from multiple hreflang tags', async () => {
        const context: DetectionContext = {
          htmlContent: `
            <link rel="alternate" hreflang="en-US" href="https://example.com" />
            <link rel="alternate" hreflang="de-DE" href="https://example.de" />
            <link rel="alternate" hreflang="fr-FR" href="https://example.fr" />
          `,
        };

        const result = await detector.detectLocale(context);

        // Should return first supported locale found
        expect(['en-US', 'de-DE', 'fr-FR']).toContain(result.detectedLocale);
        expect(result.detectionMethod).toBe('hreflang');
      });

      it('should handle case-insensitive hreflang values', async () => {
        const context: DetectionContext = {
          htmlContent: '<link rel="alternate" hreflang="DE-DE" href="https://example.de" />',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('hreflang');
      });

      it('should skip unsupported hreflang locales', async () => {
        const context: DetectionContext = {
          htmlContent: `
            <link rel="alternate" hreflang="ja-JP" href="https://example.jp" />
            <link rel="alternate" hreflang="de-DE" href="https://example.de" />
          `,
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('hreflang');
      });

      it('should return null for empty hreflang tags', async () => {
        const context: DetectionContext = {
          htmlContent: '<html><head></head><body></body></html>',
        };

        const result = await detector.detectLocale(context);

        // Should fall back to default
        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
      });
    });

    describe('GBP Detection (Priority 4)', () => {
      it('should detect locale from GBP location', async () => {
        const context: DetectionContext = {
          gbpLocation: 'Germany',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('gbp');
        expect(result.confidence).toBe(0.75);
      });

      it('should detect locale from GBP location France', async () => {
        const context: DetectionContext = {
          gbpLocation: 'France',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('fr-FR');
        expect(result.detectionMethod).toBe('gbp');
      });

      it('should detect locale from GBP location Canada', async () => {
        const context: DetectionContext = {
          gbpLocation: 'Canada',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-CA');
        expect(result.detectionMethod).toBe('gbp');
      });

      it('should return null for unsupported GBP location', async () => {
        const context: DetectionContext = {
          gbpLocation: 'Japan',
        };

        const result = await detector.detectLocale(context);

        // Should fall back to default
        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
      });
    });

    describe('IP Geolocation (Priority 5)', () => {
      it('should detect locale from IP address', async () => {
        const context: DetectionContext = {
          ipAddress: '1.1.1.1',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('ip_geolocation');
        expect(result.confidence).toBe(0.6);
      });

      it('should detect locale from different IP address', async () => {
        const context: DetectionContext = {
          ipAddress: '3.3.3.3',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('ip_geolocation');
      });

      it('should return null for unknown IP address', async () => {
        const context: DetectionContext = {
          ipAddress: '192.168.1.1',
        };

        const result = await detector.detectLocale(context);

        // Should fall back to default
        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
      });
    });

    describe('Default Fallback (Priority 6)', () => {
      it('should return en-US when all detection methods fail', async () => {
        const context: DetectionContext = {};

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
        expect(result.confidence).toBe(0.5);
      });

      it('should return en-US when all signals are invalid', async () => {
        const context: DetectionContext = {
          domain: 'invalid',
          htmlContent: '<html></html>',
          gbpLocation: 'Unknown',
          ipAddress: '999.999.999.999',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('en-US');
        expect(result.detectionMethod).toBe('default');
      });
    });

    describe('Priority Chain Verification', () => {
      it('should prefer manual override over TLD', async () => {
        const context: DetectionContext = {
          manualOverride: 'fr-FR',
          domain: 'example.de',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('fr-FR');
        expect(result.detectionMethod).toBe('manual_override');
      });

      it('should prefer TLD over hreflang', async () => {
        const context: DetectionContext = {
          domain: 'example.de',
          htmlContent: '<link rel="alternate" hreflang="fr-FR" />',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('tld');
      });

      it('should prefer hreflang over GBP', async () => {
        const context: DetectionContext = {
          htmlContent: '<link rel="alternate" hreflang="de-DE" />',
          gbpLocation: 'France',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('hreflang');
      });

      it('should prefer GBP over IP geolocation', async () => {
        const context: DetectionContext = {
          gbpLocation: 'Germany',
          ipAddress: '1.1.1.1', // Would detect en-US
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('gbp');
      });

      it('should prefer IP geolocation over default', async () => {
        const context: DetectionContext = {
          ipAddress: '3.3.3.3',
        };

        const result = await detector.detectLocale(context);

        expect(result.detectedLocale).toBe('de-DE');
        expect(result.detectionMethod).toBe('ip_geolocation');
      });
    });

    describe('Fallback Chain', () => {
      it('should include detected locale in fallback chain', async () => {
        const context: DetectionContext = {
          manualOverride: 'de-DE',
        };

        const result = await detector.detectLocale(context);

        expect(result.fallbackChain).toContain('de-DE');
      });

      it('should have non-empty fallback chain', async () => {
        const context: DetectionContext = {};

        const result = await detector.detectLocale(context);

        expect(result.fallbackChain.length).toBeGreaterThan(0);
      });
    });

    describe('Confidence Scores', () => {
      it('should have confidence 1.0 for manual override', async () => {
        const context: DetectionContext = {
          manualOverride: 'de-DE',
        };

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(1.0);
      });

      it('should have confidence 0.8 for TLD', async () => {
        const context: DetectionContext = {
          domain: 'example.de',
        };

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(0.8);
      });

      it('should have confidence 0.7 for hreflang', async () => {
        const context: DetectionContext = {
          htmlContent: '<link rel="alternate" hreflang="de-DE" />',
        };

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(0.7);
      });

      it('should have confidence 0.75 for GBP', async () => {
        const context: DetectionContext = {
          gbpLocation: 'Germany',
        };

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(0.75);
      });

      it('should have confidence 0.6 for IP geolocation', async () => {
        const context: DetectionContext = {
          ipAddress: '1.1.1.1',
        };

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(0.6);
      });

      it('should have confidence 0.5 for default', async () => {
        const context: DetectionContext = {};

        const result = await detector.detectLocale(context);

        expect(result.confidence).toBe(0.5);
      });
    });
  });

  describe('getLocaleConfig', () => {
    it('should return locale config for supported locale', async () => {
      const config = await detector.getLocaleConfig('de-DE');

      expect(config).toBeDefined();
      expect(config?.locale).toBe('de-DE');
      expect(config?.language).toBe('German');
      expect(config?.primarySearchEngine).toBe('google');
      expect(config?.currency).toBe('EUR');
      expect(config?.regulations).toContain('GDPR');
      expect(config?.tone).toBe('formal');
    });

    it('should return null for unsupported locale', async () => {
      const config = await detector.getLocaleConfig('ja-JP');

      expect(config).toBeNull();
    });

    it('should return config with all required fields', async () => {
      const config = await detector.getLocaleConfig('en-US');

      expect(config?.locale).toBeDefined();
      expect(config?.language).toBeDefined();
      expect(config?.primarySearchEngine).toBeDefined();
      expect(config?.currency).toBeDefined();
      expect(config?.regulations).toBeDefined();
      expect(config?.tone).toBeDefined();
      expect(config?.benchmarkCohorts).toBeDefined();
    });

    it('should return config with correct regulations for EU locales', async () => {
      const deConfig = await detector.getLocaleConfig('de-DE');
      const frConfig = await detector.getLocaleConfig('fr-FR');
      const esConfig = await detector.getLocaleConfig('es-ES');

      expect(deConfig?.regulations).toContain('GDPR');
      expect(frConfig?.regulations).toContain('GDPR');
      expect(esConfig?.regulations).toContain('GDPR');
    });

    it('should return config with PIPEDA for Canada', async () => {
      const config = await detector.getLocaleConfig('en-CA');

      expect(config?.regulations).toContain('PIPEDA');
    });

    it('should return config with Privacy Act for Australia', async () => {
      const config = await detector.getLocaleConfig('en-AU');

      expect(config?.regulations).toContain('Privacy Act');
    });
  });

  describe('validateLocale', () => {
    it('should validate supported locale', async () => {
      const isValid = await detector.validateLocale('de-DE');

      expect(isValid).toBe(true);
    });

    it('should reject unsupported locale', async () => {
      const isValid = await detector.validateLocale('ja-JP');

      expect(isValid).toBe(false);
    });

    it('should validate all launch locales', async () => {
      const locales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

      for (const locale of locales) {
        const isValid = await detector.validateLocale(locale);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('getSupportedLocales', () => {
    it('should return all supported locales', async () => {
      const locales = await detector.getSupportedLocales();

      expect(locales).toContain('en-US');
      expect(locales).toContain('en-GB');
      expect(locales).toContain('en-CA');
      expect(locales).toContain('en-AU');
      expect(locales).toContain('de-DE');
      expect(locales).toContain('fr-FR');
      expect(locales).toContain('es-ES');
    });

    it('should return exactly 7 supported locales', async () => {
      const locales = await detector.getSupportedLocales();

      expect(locales.length).toBe(7);
    });

    it('should not include unsupported locales', async () => {
      const locales = await detector.getSupportedLocales();

      expect(locales).not.toContain('ja-JP');
      expect(locales).not.toContain('zh-CN');
      expect(locales).not.toContain('ru-RU');
    });
  });

  describe('Error Handling', () => {
    it('should handle null domain gracefully', async () => {
      const context: DetectionContext = {
        domain: null as any,
      };

      const result = await detector.detectLocale(context);

      expect(result.detectedLocale).toBe('en-US');
      expect(result.detectionMethod).toBe('default');
    });

    it('should handle malformed HTML gracefully', async () => {
      const context: DetectionContext = {
        htmlContent: 'not valid html <link rel="alternate" hreflang="de-DE"',
      };

      const result = await detector.detectLocale(context);

      // Should still try to parse and find hreflang
      expect(result.detectedLocale).toBe('de-DE');
      expect(result.detectionMethod).toBe('hreflang');
    });

    it('should handle invalid IP address gracefully', async () => {
      const context: DetectionContext = {
        ipAddress: 'not-an-ip',
      };

      const result = await detector.detectLocale(context);

      expect(result.detectedLocale).toBe('en-US');
      expect(result.detectionMethod).toBe('default');
    });
  });
});
