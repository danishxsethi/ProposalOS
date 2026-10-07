import { createHash, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { validateApiKey } from '@/lib/auth/apiKeys';
import { logger } from '@/lib/logger';
import { runWithTenantAsync } from '@/lib/tenant/context';

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function isInternalOpsRequest(req: Request): boolean {
  const configured = process.env.INTERNAL_OPS_KEY;
  const supplied = req.headers.get('x-internal-ops-key');
  return Boolean(configured && supplied && timingSafeStringEqual(supplied, configured));
}

// Typed handler signature used by withAuth and withRole
// Note: args uses any[] (not unknown[]) because Next.js route handlers receive typed `{ params }` objects
// as the second argument, which cannot be assigned to unknown without breaking all dynamic routes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthHandler = (req: Request, ...args: any[]) => Promise<Response | NextResponse>;

// Typed session user — avoids `as any` casts throughout auth middleware
interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
}

// Middleware to check authentication (Session OR API Key)
// API key can be passed via Authorization: Bearer <key> OR X-API-Key header (for Cloud Run + identity token)
export function withAuth(handler: AuthHandler) {
  return async (req: Request, ...args: any[]) => {
    if (isInternalOpsRequest(req)) {
      // The secret establishes server authority; the tenant header is only a requested
      // target for this privileged server-to-server operation.
      const tenantId = req.headers.get('x-tenant-id')?.trim();
      if (!tenantId) {
        return NextResponse.json(
          { error: 'x-tenant-id is required for internal ops requests' },
          { status: 400 }
        );
      }
      return runWithTenantAsync(tenantId, () => handler(req, ...args));
    }

    const authHeader = req.headers.get('Authorization');
    const xApiKey = req.headers.get('x-api-key')?.trim();
    const token =
      xApiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    // 1. Check for API Key (from X-API-Key or Bearer)
    if (token) {
      // 1a. Database API key (pe_live_*) — primary, tenant-scoped
      if (token.startsWith('pe_live_')) {
        const validation = await validateApiKey(token);

        if (!validation) {
          return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        }

        if ('error' in validation) {
          return NextResponse.json({ error: validation.error }, { status: 429 });
        }

        const tenantId = validation.tenantId;
        logger.info({ authMethod: 'api_key', tenantId }, 'Auth: database API key');

        return runWithTenantAsync(tenantId, () => handler(req, ...args));
      }

      // 1b. Env API key fallback — server-to-server, single-tenant only.
      // Tenant identity is bound server-side (DEFAULT_TENANT_ID). Caller-controlled
      // x-tenant-id is ignored (P0/P1-16 containment).
      if (process.env.API_KEY && timingSafeStringEqual(token, process.env.API_KEY)) {
        const tenantId = process.env.DEFAULT_TENANT_ID?.trim();

        if (!tenantId) {
          logger.warn(
            { authMethod: 'env_key' },
            'Auth: env API key rejected — DEFAULT_TENANT_ID not configured'
          );
          return NextResponse.json(
            { error: 'Server API key is not bound to a tenant' },
            { status: 503 }
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

    // P0-1 Fix: extract tenantId from session and wrap handler in tenant context.
    // Without this, tenant-aware routes using the Prisma shim or getTenantId() would return
    // unscoped (cross-tenant) data for session-authenticated dashboard users.
    const authUser = session.user as AuthUser;
    const sessionTenantId = authUser.tenantId;
    if (!sessionTenantId) {
      logger.warn(
        { authMethod: 'session', email: authUser.email },
        'Auth: session has no tenantId'
      );
      return NextResponse.json(
        { error: 'No tenant associated with this session. Please contact support.' },
        { status: 403 }
      );
    }

    logger.info({ authMethod: 'session', tenantId: sessionTenantId }, 'Auth: session');
    return runWithTenantAsync(sessionTenantId, () => handler(req, ...args));
  };
}
