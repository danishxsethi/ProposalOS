/**
 * tests/architecture/abuse-defense-boundary.test.ts
 *
 * Architectural boundary tests ensuring that:
 * - No API routes under `app/api` define or use raw in-memory maps (`new Map()`) for rate limiting or request counting.
 * - All rate-limiting store operations use central SHA-256 hashed keys for client IPs, session IDs, API keys, or web link tokens.
 * - No unhashed credentials or raw IPs are stored as keys in our SharedStore.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Abuse Defense Architectural Boundaries', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function scanDir(dir: string, callback: (filePath: string) => void) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (
          file !== 'node_modules' &&
          file !== '.next' &&
          file !== '.git' &&
          file !== 'tests' &&
          file !== '__tests__'
        ) {
          scanDir(filePath, callback);
        }
      } else if (stat.isFile()) {
        if (
          filePath.endsWith('.ts') ||
          filePath.endsWith('.tsx') ||
          filePath.endsWith('.js') ||
          filePath.endsWith('.jsx')
        ) {
          callback(filePath);
        }
      }
    }
  }

  it('enforces that no API routes define custom in-memory Maps for rate limiting', () => {
    const offendingFiles: string[] = [];
    const apiDir = path.join(rootDir, 'app/api');

    const checkNoLocalMapLimiters = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check if file uses `new Map()`
      if (content.includes('new Map(') || content.includes('new Map<')) {
        // Check if the Map appears to be used for rate-limiting, IP request tracking, or request blocking
        const rateLimitKeywords = [
          'ip',
          'rateLimit',
          'rate-limit',
          'limiter',
          'requestCount',
          'attempts',
          'blocklist',
          'throttle',
        ];

        // Is there a variable declaration with map name that sounds like rate limiting?
        const isRateLimitingMap = rateLimitKeywords.some((keyword) => {
          const regex = new RegExp(`(const|let|var)\\s+\\w*${keyword}\\w*\\s*=\\s*new\\s+Map`, 'i');
          return regex.test(content);
        });

        if (isRateLimitingMap) {
          offendingFiles.push(filePath);
        }
      }
    };

    if (fs.existsSync(apiDir)) {
      scanDir(apiDir, checkNoLocalMapLimiters);
    }

    expect(offendingFiles).toEqual([]);
  });

  it('ensures SharedStore and checkRateLimit key builder uses hashing for sensitive keys', () => {
    const offendingFiles: string[] = [];
    const libDir = path.join(rootDir, 'lib');

    const checkKeyHashing = (filePath: string) => {
      // We only care about rate-limiting middleware or keys definition
      if (!filePath.includes('rateLimit') && !filePath.includes('abuseDefense')) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Ensure buildRateLimitKey hashes variables like ip, apiKey, sessionId, token
      // If we see raw keys being constructed like `rl:ip:${ip}` instead of `rl:ip:${hashSensitive(ip)}`, flag it
      const unhashedKeyPatterns = [
        /`rl:ip:\${ip}/i,
        /`rl:api:\${apiKey}/i,
        /`rl:session:\${sessionId}/i,
        /`rl:token:\${token}/i,
      ];

      const hasUnhashedPattern = unhashedKeyPatterns.some((pattern) => pattern.test(content));
      if (hasUnhashedPattern) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(libDir)) {
      scanDir(libDir, checkKeyHashing);
    }

    expect(offendingFiles).toEqual([]);
  });

  it('enforces that no standard app/api routes store raw client IP or credentials directly in SharedStore', () => {
    const offendingFiles: string[] = [];
    const apiDir = path.join(rootDir, 'app/api');

    const checkNoDirectStoreKeys = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf8');

      // We should not write directly to SharedStore with unhashed raw tokens or keys
      // Search for .set or .increment or .setIfNotExists on store using raw token identifiers
      // E.g., store.increment(token) or store.set(ip, ...)
      const rawStoreKeysRegex = /store\.(set|increment|setIfNotExists)\(\s*(token|ip|apiKey|req\.url|session|cookie)/i;
      
      if (rawStoreKeysRegex.test(content)) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(apiDir)) {
      scanDir(apiDir, checkNoDirectStoreKeys);
    }

    expect(offendingFiles).toEqual([]);
  });
});
