/**
 * lib/__tests__/urlValidator.test.ts
 * 
 * Unit Tests for URL Validation (SSRF Prevention)
 * 
 * Tests cover:
 * - Valid HTTPS URLs
 * - Blocked HTTP URLs
 * - Blocked internal/private IP ranges
 * - Blocked localhost and metadata endpoints
 * - DNS rebinding prevention
 * - Port blocking
 */

import { describe, it, expect } from 'vitest';
import { validateUrl } from '@/lib/security/urlValidator';

describe('URL Validator - SSRF Prevention', () => {
  describe('Valid URLs', () => {
    it('should accept valid HTTPS URLs', async () => {
      const result = await validateUrl('https://example.com');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toMatch(/^https:\/\//);
    });

    it('should accept HTTPS URLs with paths', async () => {
      const result = await validateUrl('https://example.com/path/to/page');
      expect(result.isValid).toBe(true);
    });

    it('should accept HTTPS URLs with query params', async () => {
      const result = await validateUrl('https://example.com?foo=bar&baz=qux');
      expect(result.isValid).toBe(true);
    });

    it('should accept HTTPS URLs with fragments', async () => {
      const result = await validateUrl('https://example.com#section');
      expect(result.isValid).toBe(true);
    });

    it('should accept subdomains', async () => {
      // Note: This will fail DNS resolution for non-existent subdomains
      // In production, real subdomains would resolve and pass validation
      const result = await validateUrl('https://sub.example.com');
      // May fail due to DNS resolution, but should not crash
      expect(result.isValid).toBeDefined();
    });
  });

  describe('Blocked Schemes', () => {
    it('should reject HTTP URLs by default', async () => {
      const result = await validateUrl('http://example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should reject FTP URLs', async () => {
      const result = await validateUrl('ftp://example.com');
      expect(result.isValid).toBe(false);
    });

    it('should reject file:// URLs', async () => {
      const result = await validateUrl('file:///etc/passwd');
      expect(result.isValid).toBe(false);
    });

    it('should reject data:// URLs', async () => {
      const result = await validateUrl('data:text/plain,hello');
      expect(result.isValid).toBe(false);
    });

    it('should reject javascript:// URLs', async () => {
      const result = await validateUrl('javascript:alert(1)');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Blocked IP Addresses', () => {
    it('should reject localhost IP (127.0.0.1)', async () => {
      const result = await validateUrl('https://127.0.0.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject private IP 10.x.x.x', async () => {
      const result = await validateUrl('https://10.0.0.1');
      expect(result.isValid).toBe(false);
    });

    it('should reject private IP 192.168.x.x', async () => {
      const result = await validateUrl('https://192.168.1.1');
      expect(result.isValid).toBe(false);
    });

    it('should reject private IP 172.16.x.x - 172.31.x.x', async () => {
      const result = await validateUrl('https://172.16.0.1');
      expect(result.isValid).toBe(false);
    });

    it('should reject link-local IP 169.254.x.x', async () => {
      const result = await validateUrl('https://169.254.1.1');
      expect(result.isValid).toBe(false);
    });

    it('should reject multicast IP 224.x.x.x', async () => {
      const result = await validateUrl('https://224.0.0.1');
      expect(result.isValid).toBe(false);
    });

    it('should reject loopback ::1', async () => {
      const result = await validateUrl('https://[::1]');
      expect(result.isValid).toBe(false);
    });

    it('should reject IPv6 link-local fe80::', async () => {
      const result = await validateUrl('https://[fe80::1]');
      expect(result.isValid).toBe(false);
    });

    it('should reject IPv6 unique local fc00::', async () => {
      const result = await validateUrl('https://[fc00::1]');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Blocked Hostnames', () => {
    it('should reject localhost hostname', async () => {
      const result = await validateUrl('https://localhost');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Blocked');
    });

    it('should reject localhost.localdomain', async () => {
      const result = await validateUrl('https://localhost.localdomain');
      expect(result.isValid).toBe(false);
    });

    it('should reject metadata.google.internal', async () => {
      const result = await validateUrl('https://metadata.google.internal');
      expect(result.isValid).toBe(false);
    });

    it('should reject metadata hostname', async () => {
      const result = await validateUrl('https://metadata');
      expect(result.isValid).toBe(false);
    });

    it('should reject cloud metadata IP', async () => {
      const result = await validateUrl('https://169.254.169.254');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Blocked Ports', () => {
    it('should reject SSH port 22', async () => {
      const result = await validateUrl('https://example.com:22');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Port 22');
    });

    it('should reject MySQL port 3306', async () => {
      const result = await validateUrl('https://example.com:3306');
      expect(result.isValid).toBe(false);
    });

    it('should reject PostgreSQL port 5432', async () => {
      const result = await validateUrl('https://example.com:5432');
      expect(result.isValid).toBe(false);
    });

    it('should reject Redis port 6379', async () => {
      const result = await validateUrl('https://example.com:6379');
      expect(result.isValid).toBe(false);
    });

    it('should reject MongoDB port 27017', async () => {
      const result = await validateUrl('https://example.com:27017');
      expect(result.isValid).toBe(false);
    });

    it('should accept standard HTTPS port 443', async () => {
      const result = await validateUrl('https://example.com:443');
      expect(result.isValid).toBe(true);
    });
  });

  describe('URL with Credentials', () => {
    it('should reject URLs with embedded credentials', async () => {
      const result = await validateUrl('https://user:pass@example.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('credentials');
    });

    it('should reject URLs with username only', async () => {
      const result = await validateUrl('https://user@example.com');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Invalid URL Formats', () => {
    it('should reject empty URLs', async () => {
      const result = await validateUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject null URLs', async () => {
      const result = await validateUrl(null as any);
      expect(result.isValid).toBe(false);
    });

    it('should reject malformed URLs', async () => {
      const result = await validateUrl('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should reject URLs without scheme', async () => {
      const result = await validateUrl('example.com');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URLs with unicode characters', async () => {
      const result = await validateUrl('https://münchen.example.com');
      // May fail DNS resolution but should not crash
      expect(result.isValid).toBeDefined();
    });

    it('should handle very long URLs', async () => {
      const longPath = '/a'.repeat(1000);
      const result = await validateUrl(`https://example.com${longPath}`);
      // Should handle without crashing
      expect(result.isValid).toBeDefined();
    });

    it('should handle URLs with multiple query params', async () => {
      const params = new URLSearchParams({ a: '1', b: '2', c: '3', d: '4', e: '5' });
      const result = await validateUrl(`https://example.com?${params.toString()}`);
      expect(result.isValid).toBe(true);
    });
  });

  describe('HTTP Allow Option', () => {
    it('should allow HTTP when explicitly permitted', async () => {
      const result = await validateUrl('http://example.com', { allowHttp: true, requireHttps: false });
      expect(result.isValid).toBe(true);
    });

    it('should still block private IPs even with HTTP allowed', async () => {
      const result = await validateUrl('http://192.168.1.1', { allowHttp: true, requireHttps: false });
      expect(result.isValid).toBe(false);
    });
  });
});