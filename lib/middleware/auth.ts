import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateApiKey } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

// Middleware to check authentication (Session OR API Key)
// API key can be passed via Authorization: Bearer <key> OR X-API-Key header (for Cloud Run + identity token)
export function withAuth(handler: Function) {
    return async (req: Request, ...args: any[]) => {
        const authHeader = req.headers.get('Authorization');
        const xApiKey = req.headers.get('x-api-key')?.trim();
        const token = xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

        // 1. Check for API Key (from X-API-Key or Bearer)
        if (token) {

        // 1a. Database API key (pe_live_*) — primary, tenant-scoped
        if (token.startsWith('pe_live_')) {
                const validation = await validateApiKey(token);

                if (!validation) {
                    return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
                }

                if (validation.error) {
                    return NextResponse.json({ error: validation.error }, { status: 429 });
                }

                const tenantId = validation.tenantId ?? '';
                logger.info({ authMethod: 'api_key', tenantId }, 'Auth: database API key');

            return runWithTenantAsync(tenantId, () => handler(req, ...args));
        }

        // 1b. Env API key fallback — server-to-server, single-tenant
        if (process.env.API_KEY && token === process.env.API_KEY) {
                const headerTenant = req.headers.get('x-tenant-id')?.trim();
                let tenantId: string | null =
                    (headerTenant || process.env.DEFAULT_TENANT_ID || null) as string | null;

                if (!tenantId) {
                    try {
                        const firstTenant = await prisma.tenant.findFirst({
                            where: { isActive: true },
                            select: { id: true }
                        });
                        tenantId = firstTenant?.id ?? null;
                    } catch {
                        tenantId = null;
                    }
                }

                if (!tenantId) {
                    return NextResponse.json(
                        { error: 'Env API key requires x-tenant-id header or DEFAULT_TENANT_ID' },
                        { status: 401 }
                    );
                }

                logger.info({ authMethod: 'env_key', tenantId }, 'Auth: env API key');

            return runWithTenantAsync(tenantId, () => handler(req, ...args));
        }
        }

        // 2. Fallback to Session Auth
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return handler(req, ...args);
    };
}
