
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateApiKey } from '@/lib/auth/apiKeys';

// Middleware to check authentication (Session OR API Key)
export function withAuth(handler: Function) {
    return async (req: Request, ...args: any[]) => {
        // 1. Check for API Key in Authorization Header
        const authHeader = req.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer pe_live_')) {
            const apiKey = authHeader.split(' ')[1];
            const validation = await validateApiKey(apiKey);

            if (!validation) {
                return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
            }

            if (validation.error) {
                return NextResponse.json({ error: validation.error }, { status: 429 });
            }

            // Inject tenantId into header for downstream consumption if needed, 
            // but mostly validation returns context we can use if we modify handler signature.
            // For now, we'll monkey-patch a "user" object onto the request if possible, 
            // or we expect the handler to call `getTenantId()` which usually looks at headers/cookies.
            // Since `getTenantId` looks at headers, let's set a header for internal use?
            // Actually `getTenantId` in `lib/tenant/context.ts` might need update to read from a specific header if using API keys.
            // Let's assume for now we just pass through.

            // Note: createScopedPrisma and getTenantId rely on context. 
            // We might need to handle context passing.

            // For MVP, we'll trust that the handler will verify tenant context or we update `getTenantId` to check a header we set here.

            const reqWithContext = new Request(req, {
                headers: new Headers(req.headers)
            });
            reqWithContext.headers.set('x-tenant-id', validation.tenantId);

            return handler(reqWithContext, ...args);
        }

        // 2. Fallback to Session Auth
        const session = await auth();
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return handler(req, ...args);
    };
}
