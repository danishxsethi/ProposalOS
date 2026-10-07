import { randomUUID } from 'crypto';

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { createPublicTenantLogoUrl, uploadToS3 } from '@/lib/storage';
import { getTenantId } from '@/lib/tenant/context';

const LOGO_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const POST = withAuth(async (req: Request) => {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
    }

    const extension = LOGO_TYPES[file.type];
    if (!extension) {
      return NextResponse.json({ error: 'Use a PNG, JPEG, or WebP logo' }, { status: 415 });
    }

    const key = `logos/${tenantId}/logo_${Date.now()}_${randomUUID()}${extension}`;
    await uploadToS3(Buffer.from(await file.arrayBuffer()), key, file.type);

    return NextResponse.json({ url: createPublicTenantLogoUrl(tenantId, key) });
  } catch (error) {
    logger.error({ error }, 'Logo upload error');
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
});
