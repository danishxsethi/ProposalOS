import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenantContext = vi.hoisted(() => ({ getTenantId: vi.fn() }));
const storage = vi.hoisted(() => ({ getProtectedObjectUrl: vi.fn() }));

vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: (request: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: tenantContext.getTenantId,
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, getProtectedObjectUrl: storage.getProtectedObjectUrl };
});

import { GET } from '@/app/api/storage/private/route';

const request = (reference: string) =>
  new Request(`https://proposalos.test/api/storage/private?ref=${encodeURIComponent(reference)}`);

describe('private S3 object route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantContext.getTenantId.mockResolvedValue('tenant-a');
    storage.getProtectedObjectUrl.mockResolvedValue(
      'https://s3.test/private-object?signature=test'
    );
  });

  it('redirects an authorized tenant to a short-lived signed S3 URL', async () => {
    const response = await GET(request('s3://proposalos-data/proposals/tenant-a/offer.pdf'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://s3.test/private-object?signature=test');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(storage.getProtectedObjectUrl).toHaveBeenCalledWith(
      's3://proposalos-data/proposals/tenant-a/offer.pdf',
      300
    );
  });

  it('rejects cross-tenant object references without signing them', async () => {
    const response = await GET(request('s3://proposalos-data/proposals/tenant-b/private.pdf'));

    expect(response.status).toBe(404);
    expect(storage.getProtectedObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects public logo and unknown prefixes from the private route', async () => {
    const logo = await GET(request('s3://proposalos-data/logos/tenant-a/logo.png'));
    const unknown = await GET(request('s3://proposalos-data/other/tenant-a/object.bin'));

    expect(logo.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(storage.getProtectedObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects malformed and traversal references', async () => {
    const malformed = await GET(request('not-an-s3-reference'));
    const traversal = await GET(
      request('s3://proposalos-data/proposals/tenant-a/../tenant-b/private.pdf')
    );

    expect(malformed.status).toBe(404);
    expect(traversal.status).toBe(404);
    expect(storage.getProtectedObjectUrl).not.toHaveBeenCalled();
  });

  it('requires tenant authentication before processing an object reference', async () => {
    tenantContext.getTenantId.mockResolvedValue(null);

    const response = await GET(request('s3://proposalos-data/proposals/tenant-a/offer.pdf'));

    expect(response.status).toBe(401);
    expect(storage.getProtectedObjectUrl).not.toHaveBeenCalled();
  });
});
