/**
 * Extract business information from a URL
 * Fetches title from the website to use as business name
 */
import { logger } from '@/lib/logger';
export async function extractBusinessFromUrl(url: string): Promise<{
  url: string;
  name: string;
  domain: string;
}> {
  try {
    // Ensure URL has protocol
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    // Extract domain
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    // Fetch homepage to extract business name from title
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProposalOS/1.0; +https://proposalengine.com/bot)',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawName = titleMatch?.[1]?.trim() || domain;

    // Clean up common title suffixes
    let name = ((rawName.replace(/\s*[-|–]\s*/g, ' - ').split(' - ')[0] ?? '')
      .replace(/\s*\|\s*/g, ' | ')
      .split(' | ')[0] ?? '')
      .trim();

    // Fallback to domain-based name if title is too generic
    if (
      name.length < 3 ||
      name.toLowerCase().includes('home') ||
      name.toLowerCase() === 'welcome'
    ) {
      // Convert domain to business name (remove TLD, capitalize)
      const domainPrefix = domain.split('.')[0] ?? '';
      name = domainPrefix
        .split('-')
        .map((word) => (word.charAt(0) || '').toUpperCase() + word.slice(1))
        .join(' ');
    }

    return { url, name, domain };
  } catch (error) {
    logger.error({ error }, 'Error extracting business from URL');

    // Fallback: use domain as name
    try {
      const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
      const domain = urlObj.hostname.replace('www.', '');
      const domainPrefix = domain.split('.')[0] ?? '';
      const name = domainPrefix
        .split('-')
        .map((word) => (word.charAt(0) || '').toUpperCase() + word.slice(1))
        .join(' ');

      return { url: urlObj.toString(), name, domain };
    } catch {
      throw new Error('Invalid URL format');
    }
  }
}
