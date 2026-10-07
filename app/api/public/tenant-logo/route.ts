import { NextResponse } from 'next/server';

import { createStorageReference, getStorageObject } from '@/lib/storage';

const PUBLIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const tenantId = params.get('tenantId');
  const key = params.get('key');
  if (!tenantId || !key || !key.startsWith(`logos/${tenantId}/`)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const object = await getStorageObject(createStorageReference(key));
    const contentType = object.contentType || 'application/octet-stream';
    if (!PUBLIC_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
