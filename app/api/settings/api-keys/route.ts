import { NextResponse } from 'next/server';

import { generateApiKey } from '@/lib/auth/apiKeys';
import { withAuth } from '@/lib/middleware/auth';
import { withRole } from '@/lib/middleware/withRole';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

// List Keys — any authenticated tenant member can view
export const GET = withAuth(async (_req: Request) => {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      // NEVER select keyHash
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ keys });
});

// Create Key — admin or above
// P1-9: Only admins may create API keys (they provide programmatic tenant access)
export const POST = withRole(
  'agency_admin',
  withAuth(async (req: Request) => {
    try {
      const tenantId = await getTenantId();
      if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const body = await req.json();
      const { name, scopes, expiresInDays } = body;

      if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

      const { key, hash, prefix } = generateApiKey();

      let expiresAt = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));
      }

      const apiKey = await prisma.apiKey.create({
        data: {
          tenantId,
          name,
          keyHash: hash,
          keyPrefix: prefix,
          scopes: scopes || ['audit:read'],
          expiresAt,
        },
      });

      await recordAuditTrailEvent({
        eventType: 'apikey.created',
        tenantId,
        payload: {
          apiKeyId: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.keyPrefix,
          scopes: apiKey.scopes,
        },
      }).catch(() => {});

      // Return the raw key ONLY ONCE — never stored in plaintext
      return NextResponse.json({
        key: key,
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
      });
    } catch (error) {
      console.error('Create API Key Error:', error);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }
  })
);
