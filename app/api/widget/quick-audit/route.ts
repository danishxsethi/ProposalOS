/**
 * POST /api/widget/quick-audit
 * Lightweight audit for widget embed.
 *
 * Hardened in Task #13:
 *   - OPTIONS no longer reflects arbitrary Origin.
 *   - Origin allow-list is per-tenant, exact-match, no wildcards.
 *   - Allow-list lives on TenantBranding.allowedWidgetOrigins.
 *   - Disallowed/missing/malformed origins fail safely with no
 *     Access-Control-Allow-Origin header set.
 *
 * Tenant resolution:
 *   The caller supplies either tenantId or tenantDomain in the request body
 *   (validated by quickAuditSchema).  We resolve the tenant via narrow
 *   bypass lookup (no tenant-row data is read), then check the request
 *   Origin against the resolved tenant's allow-list.  Body-supplied tenant
 *   identifiers do NOT bypass the allow-list — the request Origin must
 *   still be in the resolved tenant's TenantBranding.allowedWidgetOrigins.
 *
 * Features:
 *   - Strict per-tenant CORS allow-list
 *   - Zod validation with quickAuditSchema
 *   - Rate limiting (10 requests/minute for widget)
 *   - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { quickAuditSchema } from '@/lib/api/schemas/audit';
import {
  extractFindingsFromRegistryResult,
  type ModuleInput,
  runModuleSubset,
} from '@/lib/audit/runner';
import { CostTracker } from '@/lib/costs/costTracker';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { getAbusePolicy } from '@/lib/security/abuseDefense/policies';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import {
  buildAllowedCorsHeaders,
  buildDeniedCorsHeaders,
  checkOriginAgainstAllowList,
  logOriginDenied,
  normalizeOrigin,
} from '@/lib/widget/origin';

import { EXECUTION_PROFILES } from '@shared/audit';

const ROUTE_PATH = '/api/widget/quick-audit';

// ─── Tenant lookup helpers ───────────────────────────────────────────────────

interface TenantWithBranding {
  id: string;
  brandingConfig: { allowedWidgetOrigins: string[] } | null;
}

async function findTenantWithBranding(
  byId: string | undefined,
  byDomain: string | undefined
): Promise<TenantWithBranding | null> {
  return runWithTenantBypass('widget-quick-audit-tenant-discovery', () => {
    if (byId) {
      return prisma.tenant.findUnique({
        where: { id: byId },
        select: {
          id: true,
          brandingConfig: { select: { allowedWidgetOrigins: true } },
        },
      }) as Promise<TenantWithBranding | null>;
    }
    return prisma.tenant.findFirst({
      where: { domain: byDomain },
      select: {
        id: true,
        brandingConfig: { select: { allowedWidgetOrigins: true } },
      },
    }) as Promise<TenantWithBranding | null>;
  });
}

// ─── Response helpers ────────────────────────────────────────────────────────

function deniedPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 403,
    headers: buildDeniedCorsHeaders(),
  });
}

function deniedJson(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  Object.entries(buildDeniedCorsHeaders()).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

function attachAllowedHeaders(response: NextResponse, allowedOrigin: string): NextResponse {
  Object.entries(buildAllowedCorsHeaders(allowedOrigin)).forEach(([k, v]) =>
    response.headers.set(k, v)
  );
  return response;
}

// ─── OPTIONS preflight ───────────────────────────────────────────────────────

/**
 * Handle CORS preflight.  We need the tenant identifier to look up the
 * allow-list, but preflight requests carry no body.  We accept the tenant
 * identifier via standard query string parameters: ?tenantId=... or
 * ?tenantDomain=...  This matches the body fields used in POST and lets
 * the embed snippet send a single tenant identifier consistently.
 *
 * If the tenant identifier is missing, malformed, or not allow-listed, the
 * preflight is denied with no Access-Control-Allow-Origin header.
 */
export async function OPTIONS(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const tenantDomain = url.searchParams.get('tenantDomain') ?? undefined;
  const rawOrigin = request.headers.get('origin');

  if (!tenantId && !tenantDomain) {
    logOriginDenied({ reason: 'no_tenant_allow_list', rawOrigin, route: ROUTE_PATH });
    return deniedPreflight();
  }

  if (!normalizeOrigin(rawOrigin)) {
    logOriginDenied({
      reason: rawOrigin ? 'malformed' : 'missing',
      rawOrigin,
      route: ROUTE_PATH,
    });
    return deniedPreflight();
  }

  let tenant: TenantWithBranding | null = null;
  try {
    tenant = await findTenantWithBranding(tenantId, tenantDomain);
  } catch {
    return deniedPreflight();
  }

  if (!tenant) {
    logOriginDenied({ reason: 'no_tenant_allow_list', rawOrigin, route: ROUTE_PATH });
    return deniedPreflight();
  }

  const allowList = tenant.brandingConfig?.allowedWidgetOrigins ?? [];
  const result = checkOriginAgainstAllowList(rawOrigin, allowList);

  if (!result.allowed) {
    logOriginDenied({
      reason: result.reason,
      rawOrigin,
      route: ROUTE_PATH,
      tenantId: tenant.id,
    });
    return deniedPreflight();
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildAllowedCorsHeaders(result.origin),
  });
}

// ─── POST handler ─────────────────────────────────────────────────────────────

async function handleQuickAudit(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  const rawOrigin = req.headers.get('origin');

  try {
    // Parse body
    const body = await req.json();
    const result = quickAuditSchema.safeParse(body);

    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return deniedJson(
        new ValidationError('Invalid input', errorDetails).toEnvelope(req.url, traceId),
        400
      );
    }

    const { url, websiteUrl, email, tenantDomain, tenantId, businessName } = result.data;
    const normalizedUrl = websiteUrl || url;

    // Resolve tenant + branding (narrow bypass lookup, no tenant-row data)
    const tenant = await findTenantWithBranding(tenantId, tenantDomain);
    if (!tenant) {
      return deniedJson(
        new NotFoundError('Tenant', tenantDomain ?? tenantId).toEnvelope(req.url, traceId),
        400
      );
    }

    // Origin allow-list check.  Rejects with no permissive headers.
    const allowList = tenant.brandingConfig?.allowedWidgetOrigins ?? [];
    const originCheck = checkOriginAgainstAllowList(rawOrigin, allowList);
    if (!originCheck.allowed) {
      logOriginDenied({
        reason: originCheck.reason,
        rawOrigin,
        route: ROUTE_PATH,
        tenantId: tenant.id,
      });
      return deniedJson(
        {
          error: {
            code: 'ORIGIN_NOT_ALLOWED',
            message: 'Request origin is not allow-listed for this widget',
            timestamp: new Date().toISOString(),
            traceId,
          },
        },
        403
      );
    }

    // Run all tenant-scoped Prisma work under the resolved tenant context.
    // P1-21: the widget's reduced-scope QUICK_AUDIT profile (website + gbp) now runs
    // through the exact same canonical MODULE_REGISTRY adapters, timeout/retry
    // wrapper, and finding-normalization logic as the full 27-module audit
    // (lib/audit/runner.ts::runModuleSubset), instead of calling
    // crawlWebsite()/runGBPModule() directly and fabricating a score formula.
    const QUICK_AUDIT_DEADLINE_MS = 20_000;
    const auditResult = await runWithTenantAsync(tenant.id, async () => {
      const audit = await prisma.audit.create({
        data: {
          tenantId: tenant.id,
          businessName: businessName || email?.split('@')[0] || 'Unknown',
          businessUrl: normalizedUrl!,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      const moduleInput: ModuleInput = {
        auditId: audit.id,
        url: normalizedUrl!,
        businessName: audit.businessName,
        city: 'Unknown', // widget does not collect a city; matches prior placeholder behavior
        tenantId: tenant.id,
      };
      const costTracker = new CostTracker();

      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), QUICK_AUDIT_DEADLINE_MS);
      let moduleResults: Map<string, { status: string; data: any; error?: string }>;
      try {
        moduleResults = await runModuleSubset(
          EXECUTION_PROFILES.QUICK_AUDIT,
          moduleInput,
          costTracker,
          controller.signal
        );
      } finally {
        clearTimeout(deadline);
      }

      // Real findings, derived from real module output — no fabricated score/topIssue.
      const allFindings: any[] = [];
      const unavailableModules: string[] = [];
      const completedModules: string[] = [];

      for (const [moduleName, res] of moduleResults.entries()) {
        if (res.status === 'COMPLETE') {
          completedModules.push(moduleName);
          const { findings } = extractFindingsFromRegistryResult(
            moduleName,
            res as any,
            moduleInput
          );
          allFindings.push(...findings);
        } else {
          // Provider/module failure or timeout is represented as unavailable/partial,
          // never as a fabricated negative business finding (Step 8 requirement 9).
          unavailableModules.push(moduleName);
        }
      }

      const highImpact = [...allFindings].sort(
        (a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0)
      );
      const topFinding = highImpact[0] ?? null;

      // Score reflects real signal only: start from full coverage of the requested
      // profile, deduct for modules that could not run, deduct per real finding
      // weighted by its own impactScore (never a static/hardcoded adjustment).
      const coverageRatio = completedModules.length / EXECUTION_PROFILES.QUICK_AUDIT.length;
      const findingPenalty = allFindings.reduce(
        (sum, f) => sum + Math.min(Number(f.impactScore) || 0, 10),
        0
      );
      const score = Math.max(0, Math.min(100, Math.round(coverageRatio * 100 - findingPenalty)));

      await prisma.audit.update({
        where: { id: audit.id },
        data: {
          status: unavailableModules.length === 0 ? 'COMPLETE' : 'PARTIAL',
          completedAt: new Date(),
          overallScore: score,
          modulesCompleted: completedModules,
          apiCostCents: costTracker.getTotalCents(),
        },
      });

      return { audit, score, topFinding, completedModules, unavailableModules };
    });

    const { audit, score, topFinding, completedModules, unavailableModules } = auditResult;
    const grade = score > 80 ? 'B' : score > 60 ? 'C' : 'D';

    const response = NextResponse.json({
      auditId: audit.id,
      score,
      grade,
      topIssue: topFinding
        ? { title: topFinding.title, description: topFinding.description }
        : null,
      // Step 8 requirement 10: explicit reduced-coverage labeling — this is NOT the
      // full 27-module audit.
      quickAudit: true,
      coverage: {
        profile: 'QUICK_AUDIT',
        modulesChecked: EXECUTION_PROFILES.QUICK_AUDIT,
        modulesCompleted: completedModules,
        modulesUnavailable: unavailableModules,
        note: 'This is a reduced quick check (website + Google Business Profile only), not the full audit.',
      },
      redirectUrl: `/proposal/preview/${audit.id}`,
    });

    response.headers.set('X-Trace-Id', traceId);
    return attachAllowedHeaders(response, originCheck.origin);
  } catch (error) {
    const internalError = new InternalError('Quick audit failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return deniedJson(internalError.toEnvelope(req.url, traceId), 500);
  }
}

const abusePolicy = getAbusePolicy('widget_audit');

const idempotentHandler = withIdempotency(handleQuickAudit, {
  includeBody: true,
  useFingerprintFallback: true,
  tenantId: async (req) => {
    try {
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      const tenant = await findTenantWithBranding(body.tenantId, body.tenantDomain);
      return tenant?.id ?? null;
    } catch {
      return null;
    }
  },
});

// Apply rate limiting for widget quick-audit API
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    ...abusePolicy,
    endpoint: 'widget_audit',
    routeClass: 'widget_audit',
  })(req, () => idempotentHandler(req));

export const POST = rateLimitedHandler;
