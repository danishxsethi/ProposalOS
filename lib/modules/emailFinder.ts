import * as cheerio from 'cheerio';

import { collectHtml } from '@/lib/audit/collectors/htmlCollector';
import type { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { withProviderResilience } from '@/lib/resilience/withProviderResilience';

interface EmailDiscoveryResult {
  emails: string[];
  source: string;
  confidence: number;
}

export async function findEmails(
  url: string,
  tracker?: CostTracker,
  signal?: AbortSignal,
  auditId?: string
): Promise<EmailDiscoveryResult> {
  try {
    // Ensure URL has protocol
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    logger.info({ url: targetUrl }, '[EmailFinder] Scanning');

    // Fetch main page via the shared HTML collector (memoized per audit,
    // honest auditor UA, headless-browser fallback for bot-blocking sites).
    const collected = await collectHtml(targetUrl, { auditId, signal, tracker, timeoutMs: 20000 }).catch(() => null);
    const response = collected && collected.ok && !collected.blocked
      ? ({ ok: true, status: collected.status, text: async () => collected.html } as unknown as Response)
      : null;

    if (!response || !response.ok) {
      return { emails: [], source: 'failed', confidence: 0 };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const foundEmails = new Set<string>();

    // Strategy 1: Mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').split('?')[0]?.trim() || '';
        if (isValidEmail(email)) foundEmails.add(email);
      }
    });

    // Strategy 2: Regex on body text
    const bodyText = $('body').text();
    const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
    const matches = bodyText.match(emailRegex);
    if (matches) {
      matches.forEach((email) => {
        if (isValidEmail(email)) foundEmails.add(email);
      });
    }

    // Strategy 3: Check /contact page if no emails found
    if (foundEmails.size === 0) {
      // diverse logic could go here, for now simple return
    }

    // Filter out obvious junk (e.g., example.com, wix.com if generic)
    const filtered = Array.from(foundEmails).filter((e) => !isJunkEmail(e));

    return {
      emails: filtered,
      source: 'website_scrape',
      confidence: filtered.length > 0 ? 0.8 : 0,
    };
  } catch (error) {
    logger.error({ err: error, url }, 'Email finder failed');
    return { emails: [], source: 'error', confidence: 0 };
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isJunkEmail(email: string): boolean {
  const junkDomains = ['example.com', 'domain.com', 'email.com', 'sentry.io'];
  const junkUsers = ['noreply', 'no-reply', 'admin', 'webmaster', 'support']; // support might be valid though? keeping it for now.

  // Actually support/info/hello are GOOD for businesses.
  // Let's filter only technical junk.
  const technicalJunk = ['sentry', 'bug', 'report', 'noreply', 'no-reply'];

  const domain = email.split('@')[1] || '';
  const user = email.split('@')[0] || '';

  if (junkDomains.includes(domain)) return true;
  if (technicalJunk.some((j) => user.includes(j))) return true;

  // Filter out image extensions acting as emails? unlikely with regex but possible
  if (email.endsWith('.png') || email.endsWith('.jpg')) return true;

  return false;
}
