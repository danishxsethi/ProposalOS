// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validateForBrowserNavigation } = vi.hoisted(() => ({
  validateForBrowserNavigation: vi.fn(),
}));
vi.mock('@/lib/security/safeFetch', () => ({ validateForBrowserNavigation }));

import { safePageGoto } from '@/lib/security/safeBrowser';

describe('Wave 4 browser boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateForBrowserNavigation.mockImplementation((url: string) => {
      if (url.includes('169.254.169.254')) throw new Error('blocked');
      return Promise.resolve();
    });
  });

  it('validates navigation and blocks an unsafe subresource', async () => {
    const handlers: Record<string, (value: any) => Promise<void> | void> = {};
    const page = {
      setRequestInterception: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event, handler) => {
        handlers[event] = handler;
      }),
      goto: vi.fn().mockResolvedValue(null),
      url: vi.fn(() => 'https://public.example/'),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    await safePageGoto(page as any, 'https://public.example/', { timeout: 100 });

    const abort = vi.fn().mockResolvedValue(undefined);
    await handlers.request({
      url: () => 'http://169.254.169.254/latest/meta-data',
      continue: vi.fn(),
      abort,
    });

    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(abort).toHaveBeenCalledWith('blockedbyclient');
  });
});
