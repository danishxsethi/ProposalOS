import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => fn({ signal: options.signal || new AbortController().signal }),
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetchResponseDerived: vi.fn() }));

import { safeFetchResponseDerived } from '@/lib/security/safeFetch';

import { runGbpDeepModule } from '../gbpDeep';

class Tracker {
  calls: string[] = [];
  addApiCall(name: string) {
    this.calls.push(name);
  }
}

const placeData = {
  placeId: 'place-1',
  name: 'Acme Dental',
  website: 'https://acme.test',
  rating: 4.8,
  reviewCount: 1,
  photos: [{ name: 'places/place-1/photos/photo-1' }],
  reviews: [{ publishTime: new Date().toISOString(), text: { text: 'Great' } }],
  primaryType: 'Dental clinic',
  editorialSummary: { text: 'Dental practice' },
  paymentOptions: { acceptsCreditCards: true },
};

describe('gbpDeep honest provider and dependency behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_PLACES_API_KEY = 'places-test-key';
    process.env.GOOGLE_AI_API_KEY = 'ai-test-key';
    vi.mocked(safeFetchResponseDerived).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  it('reuses canonical GBP details, validates real photo output, and leaves claimed status unavailable', async () => {
    generateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            scores: { quality: 8, relevance: 9, professionalism: 8 },
            type: 'Interior',
            flags: [],
          }),
      },
    });
    const tracker = new Tracker();

    const result = await runGbpDeepModule(
      {
        businessName: 'Acme Dental',
        city: 'Regina',
        websiteUrl: 'https://acme.test',
        placeData,
      },
      tracker as never
    );

    const analysis = result.evidenceSnapshots[0].rawResponse;
    expect(result.execution?.state).toBe('partial');
    expect(analysis.claimedStatus).toEqual({ value: null, basis: 'unavailable' });
    expect(analysis.photos.aiResults).toBe(1);
    expect(tracker.calls).toEqual(['GEMINI_PHOTO_ANALYSIS']);
    expect(tracker.calls).not.toContain('PLACES_DETAILS_DEEP');
    expect(tracker.calls).not.toContain('PLACES_TEXT_SEARCH');
  });

  it('rejects malformed model output without fabricating fallback scores', async () => {
    generateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            scores: { quality: 5, relevance: 5, professionalism: 5 },
            type: 'Interior',
            flags: ['made-up-flag'],
          }),
      },
    });

    const result = await runGbpDeepModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      websiteUrl: 'https://acme.test',
      placeData,
    });

    expect(result.execution?.state).toBe('partial');
    expect(result.evidenceSnapshots[0].rawResponse.photos.aiResults).toBe(0);
    expect(result.findings.some((finding) => finding.title === 'Low-Quality Profile Photos')).toBe(
      false
    );
  });

  it('returns unavailable when neither dependency data nor credentials exist', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const tracker = new Tracker();
    const result = await runGbpDeepModule(
      { businessName: 'Acme Dental', city: 'Regina' },
      tracker as never
    );
    expect(result.execution?.state).toBe('unavailable');
    expect(result.findings).toEqual([]);
    expect(tracker.calls).toEqual([]);
  });

  it('maps a real Places provider failure to failed, not an empty complete result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    const result = await runGbpDeepModule({
      businessName: 'Acme Dental',
      city: 'Regina',
    });
    expect(result.execution?.state).toBe('failed');
    expect(result.findings).toEqual([]);
  });

  it('propagates caller abort through Places lookup', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(controller.signal.reason))
    );

    await expect(
      runGbpDeepModule({
        businessName: 'Acme Dental',
        city: 'Regina',
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/);
  });
});
