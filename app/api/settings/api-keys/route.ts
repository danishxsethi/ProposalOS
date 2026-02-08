
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import { prisma } from '@/lib/prisma'; // Global prisma is fine for creation, but we should scope
import { generateApiKey } from '@/lib/auth/apiKeys';

// List Keys
export const GET = withAuth(async (req: Request) => {
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
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ keys });
});

// Create Key
export const POST = withAuth(async (req: Request) => {
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
                scopes: scopes || ['audit:read'], // Default scope
                expiresAt,
            }
        });

        // Return the raw key ONLY ONCE here
        return NextResponse.json({
            key: key, // The raw key (pe_live_...)
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
});
