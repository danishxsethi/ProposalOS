// @vitest-environment node
/**
 * tests/architecture/ssrf-fetch-boundary.test.ts
 *
 * Architecture test for SSRF prevention [#5].
 *
 * Ensures every raw `fetch(` in server-side production code is either:
 * 1. Replaced with safeFetch/safeFetchResponseDerived/safeFetchHttpsOnly, OR
 * 2. Explicitly listed in the ALLOWED_RAW_FETCH allowlist with justification.
 *
 * Any new raw fetch() not in the allowlist fails this test and must be
 * classified as safeFetch or added with a justification.
 *
 * Also ensures every user-influenced page.goto() has a preceding
 * validateForBrowserNavigation() call.
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../..');

// ─── Allowlist: raw fetch() calls that are permitted without safeFetch ─────────
// Each entry: { file, line (approx), reason }
// The test checks the file contains fetch( at roughly that line.
// Any raw fetch() NOT in this list is a test failure.

interface AllowedRawFetch {
  /** Relative path from repo root */
  file: string;
  /** Approximate line number (±5 tolerance for drift) */
  line: number;
  /** Fixed host being called */
  host: string;
  /** Why this is safe without safeFetch */
  reason: string;
}

const ALLOWED_RAW_FETCH: AllowedRawFetch[] = [
  // SerpAPI (fixed host: serpapi.com)
  {
    file: 'lib/modules/seoDeep.ts',
    line: 230,
    host: 'serpapi.com',
    reason: 'Fixed host; user data only in query param (businessName/city)',
  },
  {
    file: 'lib/modules/backlinks.ts',
    line: 147,
    host: 'serpapi.com',
    reason: 'Fixed host; user domain only in q= param',
  },
  {
    file: 'lib/modules/backlinks.ts',
    line: 184,
    host: 'serpapi.com',
    reason: 'Fixed host; user domain in query param',
  },
  {
    file: 'lib/modules/backlinks.ts',
    line: 243,
    host: 'serpapi.com',
    reason: 'Fixed host; user businessName in query param',
  },
  {
    file: 'lib/modules/competitor.ts',
    line: 62,
    host: 'serpapi.com',
    reason: 'Fixed host; keyword/location in query params',
  },
  {
    file: 'lib/modules/competitor.ts',
    line: 233,
    host: 'serpapi.com',
    reason: 'Fixed host; keyword in query params',
  },
  {
    file: 'lib/modules/competitor.ts',
    line: 306,
    host: 'serpapi.com',
    reason: 'Fixed host; category/location in params',
  },
  {
    file: 'lib/modules/keywordGap.ts',
    line: 208,
    host: 'serpapi.com',
    reason: 'Fixed host; keyword in query params',
  },
  {
    file: 'lib/modules/paidSearch.ts',
    line: 158,
    host: 'serpapi.com',
    reason: 'Fixed host; businessType/city in query params',
  },
  {
    file: 'lib/modules/paidSearch.ts',
    line: 236,
    host: 'serpapi.com',
    reason: 'Fixed host; businessName in query params',
  },
  {
    file: 'lib/modules/videoPresence.ts',
    line: 261,
    host: 'serpapi.com',
    reason: 'Fixed host; businessName/city in query',
  },
  {
    file: 'lib/modules/citations.ts',
    line: 240,
    host: 'serpapi.com',
    reason: 'Fixed host; businessName/city in query',
  },
  {
    file: 'lib/modules/citations.ts',
    line: 313,
    host: 'serpapi.com',
    reason: 'Fixed host; searchQuery in query param',
  },
  {
    file: 'lib/modules/citations.ts',
    line: 501,
    host: 'serpapi.com',
    reason: 'Fixed host; searchQuery in query param',
  },

  // Google Places API (fixed host: places.googleapis.com)
  {
    file: 'lib/modules/gbp.ts',
    line: 68,
    host: 'places.googleapis.com',
    reason: 'Fixed host; businessName in POST body, not URL',
  },
  {
    file: 'lib/modules/gbp.ts',
    line: 139,
    host: 'places.googleapis.com',
    reason: 'Fixed host; placeId from prior Google response (template literal path)',
  },
  {
    file: 'lib/modules/gbpDeep.ts',
    line: 98,
    host: 'places.googleapis.com',
    reason: 'Fixed host; businessName in POST body',
  },
  {
    file: 'lib/modules/gbpDeep.ts',
    line: 162,
    host: 'places.googleapis.com',
    reason: 'Fixed host; placeId from Google response (template literal path)',
  },
  {
    file: 'lib/modules/competitor.ts',
    line: 101,
    host: 'places.googleapis.com',
    reason: 'Fixed host; placeId from SerpAPI response (template literal path)',
  },

  // Google PageSpeed Insights (fixed host: googleapis.com)
  {
    file: 'lib/modules/website.ts',
    line: 343,
    host: 'googleapis.com',
    reason: 'Fixed host; user URL in ?url= param only (Google validates)',
  },
  {
    file: 'lib/modules/competitor.ts',
    line: 174,
    host: 'googleapis.com',
    reason: 'Fixed host; competitor URL from Places response in ?url= param',
  },
  {
    file: 'lib/modules/mobileUX.ts',
    line: 403,
    host: 'googleapis.com',
    reason: 'Fixed host; user URL in ?url= param',
  },
  {
    file: 'lib/modules/mobileUX.ts',
    line: 426,
    host: 'googleapis.com',
    reason: 'Fixed host; user URL in ?url= param',
  },

  // Direct scraping to hardcoded directory hosts (user data only in query params)
  {
    file: 'lib/modules/citations.ts',
    line: 175,
    host: 'yelp.com',
    reason: 'Fixed host; businessName in search query param',
  },
  {
    file: 'lib/modules/citations.ts',
    line: 369,
    host: 'bbb.org',
    reason: 'Fixed host; businessName in search query param',
  },
  {
    file: 'lib/modules/citations.ts',
    line: 426,
    host: 'yellowpages.com',
    reason: 'Fixed host; businessName in search query param',
  },

  // System-internal / fixed-host calls outside lib/modules/
  {
    file: 'lib/queue/auditJobQueue.ts',
    line: 331,
    host: 'internal (env)',
    reason: 'workerUrl from process.env — system-configured, not user-influenced',
  },
  {
    file: 'lib/retention/nps.ts',
    line: 20,
    host: 'api.resend.com',
    reason: 'Fixed host; hardcoded Resend API endpoint',
  },
  {
    file: 'lib/db.ts',
    line: 20,
    host: 'internal (env)',
    reason: 'ALERT_WEBHOOK_URL from env — system-configured RLS alert',
  },
  {
    file: 'lib/llm/providers/anthropic.ts',
    line: 119,
    host: 'api.anthropic.com',
    reason: 'Fixed baseUrl from constructor — Anthropic API',
  },
  {
    file: 'lib/notifications/slack.ts',
    line: 79,
    host: 'hooks.slack.com',
    reason: 'Webhook URL from tenant config (Slack incoming webhook)',
  },
  {
    file: 'lib/notifications/slack.ts',
    line: 133,
    host: 'hooks.slack.com',
    reason: 'Same Slack webhook pattern',
  },
  {
    file: 'lib/notifications/slack.ts',
    line: 267,
    host: 'hooks.slack.com',
    reason: 'Same Slack webhook pattern',
  },
  {
    file: 'lib/notifications/webhook.ts',
    line: 23,
    host: 'internal (env)',
    reason: 'WEBHOOK_URL from env — system alert webhook',
  },
  {
    file: 'lib/observability/alerts.ts',
    line: 224,
    host: 'internal (config)',
    reason: 'webhookUrl from alerting rule config — system-configured',
  },
  {
    file: 'lib/monitoring/syntheticChecks.ts',
    line: 143,
    host: 'internal (self)',
    reason: 'baseUrl = own app URL for synthetic health checks',
  },
  {
    file: 'lib/monitoring/syntheticChecks.ts',
    line: 215,
    host: 'internal (self)',
    reason: 'CRITICAL_ENDPOINTS — own app endpoints for monitoring',
  },
  {
    file: 'lib/monitoring/widget-performance.ts',
    line: 78,
    host: 'internal (self)',
    reason: 'Relative /api/widget/performance — same-origin client call',
  },
  {
    file: 'lib/monitoring/widget-performance.ts',
    line: 319,
    host: 'internal (self)',
    reason: 'Relative API call — same-origin',
  },

  // Outreach / discovery / enrichment (all fixed Google/SerpAPI hosts)
  {
    file: 'lib/outreach/sprint2/discovery.ts',
    line: 197,
    host: 'places.googleapis.com',
    reason: 'Fixed host; businessName in POST body',
  },
  {
    file: 'lib/outreach/sprint2/discovery.ts',
    line: 304,
    host: 'serpapi.com',
    reason: 'Fixed host; keyword in query params',
  },
  {
    file: 'lib/outreach/sprint2/discovery.ts',
    line: 383,
    host: 'serpapi.com',
    reason: 'Fixed host; keyword in query params',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 115,
    host: 'places.googleapis.com',
    reason: 'Fixed host; placeId in path (from prior Google response)',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 211,
    host: 'googleapis.com',
    reason: 'Fixed host; PSI API with URL in param',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 301,
    host: 'serpapi.com',
    reason: 'Fixed host; query in params',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 386,
    host: 'serpapi.com',
    reason: 'Fixed host; query in params',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 462,
    host: 'serpapi.com',
    reason: 'Fixed host; query in params',
  },
  {
    file: 'lib/outreach/sprint2/enrichment.ts',
    line: 496,
    host: 'serpapi.com',
    reason: 'Fixed host; query in params',
  },
  {
    file: 'lib/outreach/sprint2/qualification.ts',
    line: 139,
    host: 'places.googleapis.com',
    reason: 'Fixed host; textQuery in POST body',
  },
  {
    file: 'lib/outreach/sprint2/qualification.ts',
    line: 206,
    host: 'places.googleapis.com',
    reason: 'Fixed host; placeId in path',
  },
  {
    file: 'lib/outreach/sprint2/qualification.ts',
    line: 257,
    host: 'googleapis.com',
    reason: 'Fixed host; PSI with URL in param',
  },
  {
    file: 'lib/outreach/sprint2/qualification.ts',
    line: 390,
    host: 'serpapi.com',
    reason: 'Fixed host; query in params',
  },

  // i18n search-engine-adapters (all fixed search API hosts)
  {
    file: 'lib/i18n/search-engine-adapters.ts',
    line: 97,
    host: 'googleapis.com',
    reason: 'Fixed host; Google Custom Search API',
  },
  {
    file: 'lib/i18n/search-engine-adapters.ts',
    line: 184,
    host: 'api.bing.microsoft.com',
    reason: 'Fixed host; Bing Search API',
  },
  {
    file: 'lib/i18n/search-engine-adapters.ts',
    line: 257,
    host: 'serpapi.com',
    reason: 'Fixed host; SerpAPI',
  },
  {
    file: 'lib/i18n/search-engine-adapters.ts',
    line: 334,
    host: 'serpapi.com',
    reason: 'Fixed host; SerpAPI Yandex',
  },
];

// ─── page.goto allowlist (raw — no validateForBrowserNavigation needed) ───────

const ALLOWED_RAW_PAGE_GOTO = [
  {
    file: 'lib/evidence/screenshotCapture.ts',
    line: 423,
    reason: 'Fixed host: google.com/maps/search (user data in path only, Google host)',
  },
  {
    file: 'lib/pdf/generatePdf.ts',
    line: 85,
    reason: 'Internal app URL from env (baseUrl/proposal/token/pdf)',
  },
  {
    file: 'lib/pdf/generateCaseStudyPdf.ts',
    line: 61,
    reason: 'Internal app URL from env (baseUrl/case-study/id/pdf)',
  },
];

// ─── Test: No unallowlisted raw fetch() in server-side code ───────────────────

describe('SSRF fetch boundary [#5]', () => {
  it('all raw fetch() in lib/ are in the explicit allowlist', () => {
    const violations: string[] = [];
    const scannedFiles: string[] = [];

    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        // Skip directories
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git')
          continue;
        if (entry.name === '__tests__' || entry.name === 'tests') continue;
        // Skip excluded WIP
        if (relPath.startsWith('lib/raos/') || relPath.startsWith('lib/audit-engine/')) continue;

        if (entry.isDirectory()) {
          scanDir(fullPath);
          continue;
        }

        // Only .ts/.tsx files
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
        // Skip test files
        if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
        // Skip the safeFetch implementation itself
        if (relPath === 'lib/security/safeFetch.ts') continue;
        // Skip type definition files
        if (entry.name.endsWith('.d.ts')) continue;

        scannedFiles.push(relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          const lineNum = idx + 1;
          // Match raw fetch( but not safeFetch(, safeFetchResponseDerived(, safeFetchHttpsOnly(
          // Also skip comments and imports of fetch type
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
            return;
          if (trimmed.includes('import')) return;
          if (trimmed.includes('typeof fetch')) return;
          if (trimmed.includes('retryFetch')) return;

          // Check for raw fetch( that isn't safeFetch(
          const fetchMatch = line.match(
            /(?<!safe|safeFetchResponseDerived|safeFetchHttpsOnly)\bfetch\s*\(/
          );
          if (!fetchMatch) return;

          // Check if it's in the allowlist
          const isAllowed = ALLOWED_RAW_FETCH.some(
            (allowed) => relPath === allowed.file && Math.abs(lineNum - allowed.line) <= 5
          );

          if (!isAllowed) {
            violations.push(`${relPath}:${lineNum} — raw fetch() not in allowlist`);
          }
        });
      }
    };

    scanDir(path.join(rootDir, 'lib'));

    expect(scannedFiles.length).toBeGreaterThan(50); // Sanity: we scanned something
    expect(violations).toEqual([]);
  });

  it('all user-influenced page.goto() have validateForBrowserNavigation', () => {
    const violations: string[] = [];

    const filesToCheck = [
      'lib/evidence/screenshotCapture.ts',
      'lib/modules/accessibility.ts',
      'lib/modules/privacyCompliance.ts',
      'lib/modules/mobileUX.ts',
      'lib/modules/conversion.ts',
      'lib/pdf/generatePdf.ts',
      'lib/pdf/generateCaseStudyPdf.ts',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        if (!line.includes('page.goto(') && !line.includes('page.goto (')) return;
        if (line.trim().startsWith('//')) return;

        // Check if it's in the raw-allowed list
        const isRawAllowed = ALLOWED_RAW_PAGE_GOTO.some(
          (allowed) => relPath === allowed.file && Math.abs(lineNum - allowed.line) <= 5
        );
        if (isRawAllowed) return;

        // Check that validateForBrowserNavigation appears within 3 lines before
        const precedingLines = lines.slice(Math.max(0, idx - 3), idx).join('\n');
        if (!precedingLines.includes('validateForBrowserNavigation')) {
          violations.push(
            `${relPath}:${lineNum} — page.goto() without preceding validateForBrowserNavigation`
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('safeFetch is imported (not just declared) in files that use it', () => {
    const filesUsingSafeFetch = [
      'lib/modules/websiteCrawler.ts',
      'lib/modules/seoDeep.ts',
      'lib/modules/website.ts',
      'lib/modules/emailFinder.ts',
      'lib/modules/schemaMarkup.ts',
      'lib/modules/techStack.ts',
      'lib/modules/privacyCompliance.ts',
      'lib/modules/security.ts',
      'lib/modules/social.ts',
      'lib/modules/paidSearch.ts',
      'lib/modules/videoPresence.ts',
      'lib/modules/gbpDeep.ts',
      'lib/utils/urlExtractor.ts',
      'lib/plugins/pluginEngine.ts',
      'lib/integrations/webhooks.ts',
      'lib/llm/multimodal.ts',
    ];

    for (const relPath of filesUsingSafeFetch) {
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toContain("from '@/lib/security/safeFetch'");
    }
  });
});
