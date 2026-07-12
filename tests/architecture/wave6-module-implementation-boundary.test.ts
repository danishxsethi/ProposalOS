import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');

function source(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

describe('Wave 6 production module implementation boundary', () => {
  it('does not contain the historical socialDeep stub or phantom tracking patterns', () => {
    const text = source('lib/modules/socialDeep.ts');
    expect(text).not.toContain('exists: true');
    expect(text).not.toContain('Mocking extraction for demo speed');
    expect(text).not.toMatch(/tracker\?\.addApiCall\(['"]SERP['"]\);\s*targetUrls\s*=/);
  });

  it('does not fabricate GBP claimed state or mobile performance metrics', () => {
    expect(source('lib/modules/gbpDeep.ts')).not.toContain('isClaimed: true');
    const mobile = source('lib/modules/mobileUX.ts');
    expect(mobile).not.toContain('const cls = 0');
    expect(mobile).not.toContain('domContentLoadedEventEnd - perfData?.domContentLoadedEventStart');
  });

  it('does not use search result counts as backlink data', () => {
    const text = source('lib/modules/backlinks.ts');
    expect(text).not.toContain('site:${domain}');
    expect(text).not.toContain('link:${domain}');
    expect(text).not.toContain('serp_api_estimation');
  });

  it('does not ship Unknown/empty video metrics or treat missing dates as stale', () => {
    const text = source('lib/modules/videoPresence.ts');
    expect(text).not.toContain("subscribers: 'Unknown'");
    expect(text).not.toContain("videoCount: 'Unknown'");
    expect(text).not.toContain('if (!lastUpload) return true');
  });
});
