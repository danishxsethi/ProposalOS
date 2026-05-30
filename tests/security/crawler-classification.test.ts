// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Explicitly unmock the crawler and module to prevent leakage from other tests
vi.unmock('@/lib/modules/websiteCrawler');
vi.unmock('@/lib/modules/websiteCrawlerModule');

import { classifyFailure } from '@/lib/modules/websiteCrawler';

describe('Website Scraper Failure Classification', () => {
  describe('classifyFailure', () => {
    it('classifies timeouts correctly', () => {
      // Status 408
      expect(classifyFailure(408, '', {})).toBe('TIMEOUT');

      // AbortError
      expect(classifyFailure(500, '', {}, 'The request was aborted', 'AbortError')).toBe('TIMEOUT');

      // ProviderTimeoutError
      expect(classifyFailure(500, '', {}, 'Provider timed out', 'ProviderTimeoutError')).toBe(
        'TIMEOUT'
      );

      // Message containing 'timeout'
      expect(classifyFailure(500, '', {}, 'Connection timed out')).toBe('TIMEOUT');

      // Message containing 'deadline'
      expect(classifyFailure(500, '', {}, 'context deadline exceeded')).toBe('TIMEOUT');
    });

    it('classifies anti-bot challenges correctly', () => {
      // Status 403
      expect(classifyFailure(403, '', {})).toBe('ANTI_BOT');

      // Status 429
      expect(classifyFailure(429, '', {})).toBe('ANTI_BOT');

      // Cloudflare Server Header
      expect(classifyFailure(200, '', { server: 'cloudflare' })).toBe('ANTI_BOT');

      // Sucuri Server Header
      expect(classifyFailure(200, '', { server: 'Sucuri/Cloudproxy' })).toBe('ANTI_BOT');

      // Imperva Server Header
      expect(classifyFailure(200, '', { server: 'imperva' })).toBe('ANTI_BOT');

      // cf-ray Header
      expect(classifyFailure(200, '', { 'cf-ray': '12345' })).toBe('ANTI_BOT');

      // cf-challenge keyword in HTML
      expect(
        classifyFailure(200, '<html><head><script>cf-challenge</script></head></html>', {})
      ).toBe('ANTI_BOT');

      // "just a moment..." keyword in HTML
      expect(classifyFailure(200, '<h1>Just a moment...</h1>', {})).toBe('ANTI_BOT');
    });

    it('classifies other HTTP errors correctly', () => {
      // 500 status without custom error message
      expect(classifyFailure(500, '', {})).toBe('HTTP_ERROR');

      // 503 status
      expect(classifyFailure(503, '', {})).toBe('HTTP_ERROR');
    });

    it('classifies successful and 404 pages as NONE', () => {
      // 200 Success
      expect(classifyFailure(200, '<html>Normal Page</html>', { server: 'nginx' })).toBe('NONE');

      // 404 Not Found
      expect(classifyFailure(404, '<html>Not Found</html>', { server: 'nginx' })).toBe('NONE');
    });
  });
});
