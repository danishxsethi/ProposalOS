import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { generateApiKey } from '@/lib/auth/apiKeys';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const [user, tenant, apiKeys, team] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id } }),
      prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
      prisma.apiKey.findMany({ where: { tenantId: session.user.tenantId } }),
      prisma.user.findMany({
        where: { tenantId: session.user.tenantId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      profile: { name: user?.name, email: user?.email },
      branding: tenant?.branding || {},
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.keyPrefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        status: k.isActive ? 'Active' : 'Revoked',
      })),
      team,
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return new NextResponse('Unauthorized', { status: 401 });

    const body = await req.json();
    const action = body.action;

    if (action === 'create_api_key') {
      const { key, hash, prefix } = generateApiKey();
      const apiKey = await prisma.apiKey.create({
        data: {
          tenantId: session.user.tenantId,
          name: body.name || 'New API Key',
          keyHash: hash,
          keyPrefix: prefix,
          scopes: ['*'],
        },
      });
      // We return the raw key ONCE.
      return NextResponse.json({ success: true, key });
    }

    // Handle other actions like 'update_profile', 'update_branding' here optionally
    return NextResponse.json({ success: true });
  } catch (error) {
    return new NextResponse('Internal server error', { status: 500 });
  }
}
