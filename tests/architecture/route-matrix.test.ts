import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Machine-readable route inventory (additive, read-only).
 *
 * Enumerates every app/api route method from source and classifies:
 *  - authentication mechanism (withAuth / session / cron / worker / api-key / token-gated public)
 *  - tenant source (session/api-key, x-tenant-id internal ops, token-lookup, none)
 *  - public vs internal
 *  - mutation (write methods) and owner-resource rule
 * Emits docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/route-matrix.json
 */

const rootDir = path.resolve(__dirname, '../../');
const apiDir = path.join(rootDir, 'app/api');
const artifactsDir = path.join(
  rootDir,
  'docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts'
);

type RouteClass =
  | 'session_authenticated'
  | 'internal_ops'
  | 'cron'
  | 'worker'
  | 'token_gated_public'
  | 'public_unauthenticated'
  | 'webhook'
  | 'admin';

interface RouteEntry {
  path: string;
  method: string;
  auth: string[];
  routeClass: RouteClass;
  isPublic: boolean;
  isMutation: boolean;
  tenantSource: string;
  ownerResourceRule: string;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listRouteFiles(full));
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(full);
  }
  return out.sort();
}

function detectAuth(content: string): string[] {
  const found: string[] = [];
  if (content.includes('withAuth')) found.push('withAuth');
  if (content.includes('getServerSession')) found.push('getServerSession');
  if (content.includes('verifyCronAuth')) found.push('verifyCronAuth');
  if (content.includes('verifyWorkerAuth')) found.push('verifyWorkerAuth');
  if (content.includes('validateApiKey')) found.push('validateApiKey');
  if (content.includes('requireAdmin') || content.includes("role === 'admin'") || content.includes('role !== \'admin\'')) found.push('adminRoleCheck');
  if (content.includes('withRateLimit')) found.push('withRateLimit');
  return found;
}

function classify(rel: string, auth: string[], content: string): RouteClass {
  if (rel.startsWith('cron/')) return 'cron';
  if (rel.startsWith('worker/')) return 'worker';
  if (rel.includes('webhook')) return 'webhook';
  if (rel.startsWith('admin/')) return 'admin';
  if (
    rel.startsWith('proposal/token/') ||
    rel.startsWith('team/invite/') ||
    rel.startsWith('public/') ||
    rel.startsWith('widget/') ||
    rel.startsWith('outreach/track/') ||
    rel.startsWith('outreach/scorecard/') ||
    rel.startsWith('nps/respond') ||
    rel.startsWith('client/') ||
    rel.startsWith('email/unsubscribe') ||
    rel.startsWith('email/tracking') ||
    rel.includes('[token]') ||
    rel.startsWith('auth/') ||
    rel.startsWith('health/') ||
    rel.startsWith('openapi/')
  ) {
    return 'token_gated_public';
  }
  if (auth.length === 0) return 'public_unauthenticated';
  return 'session_authenticated';
}

function detectTenantSource(content: string, routeClass: RouteClass): string {
  const sources: string[] = [];
  if (content.includes('x-tenant-id')) sources.push('x-tenant-id-header');
  if (content.includes('getTenantId')) sources.push('tenant-context(session/api-key)');
  if (content.includes('runWithTenantAsync')) sources.push('tenant-context-wrapper');
  if (content.includes('runWithTenantBypass')) sources.push('tenant-bypass(token-lookup)');
  if (content.includes('tenantId')) sources.push('tenantId-referenced');
  if (sources.length === 0) {
    if (routeClass === 'token_gated_public') return 'token-lookup';
    return 'none-detected';
  }
  return sources.join('|');
}

function extractMethods(content: string, file: string): string[] {
  const methods = new Set<string>();
  const exportFn = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const exportConst = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  let m: RegExpExecArray | null;
  while ((m = exportFn.exec(content))) methods.add(m[1]);
  while ((m = exportConst.exec(content))) methods.add(m[1]);

  // Follow `export { POST } from '...'` re-export shims (e.g. billing/checkout-proposal)
  const reExport = /export\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  let sourceContent = content;
  while ((m = reExport.exec(content))) {
    const names = m[1].split(',').map((s) => s.trim());
    const spec = m[2];
    const resolved = spec.startsWith('@/')
      ? path.join(rootDir, spec.slice(2))
      : path.resolve(path.dirname(file), spec);
    const target = ['.ts', '/route.ts'].map((s) => resolved + s).find((p) => fs.existsSync(p));
    if (target) sourceContent += '\n' + fs.readFileSync(target, 'utf8');
    for (const n of names) {
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n)) methods.add(n);
    }
  }
  if (sourceContent !== content) {
    while ((m = exportFn.exec(sourceContent))) methods.add(m[1]);
    while ((m = exportConst.exec(sourceContent))) methods.add(m[1]);
  }
  return [...methods].sort();
}

function ownerResourceRule(rel: string, routeClass: RouteClass, method: string): string {
  if (!MUTATION_METHODS.has(method)) return 'read-only';
  if (routeClass === 'token_gated_public') return 'token-scoped: write bounded to resource resolved by unguessable token';
  if (routeClass === 'cron' || routeClass === 'worker') return 'server-authority: scheduler/worker secret, no caller tenant';
  if (routeClass === 'webhook') return 'provider-signature-verified';
  if (routeClass === 'admin') return 'admin-role-only';
  return 'tenant-scoped: resource must belong to caller tenant (session/api-key tenantId)';
}

describe('Route matrix inventory', () => {
  it('enumerates all app/api route methods into route-matrix.json', () => {
    const files = listRouteFiles(apiDir);
    expect(files.length).toBeGreaterThan(100);

    const entries: RouteEntry[] = [];
    for (const file of files) {
      const rel = path.relative(apiDir, file).replace(/\/route\.tsx?$/, '');
      const content = fs.readFileSync(file, 'utf8');
      const auth = detectAuth(content);
      const routeClass = classify(rel, auth, content);
      const tenantSource = detectTenantSource(content, routeClass);
      const methods = extractMethods(content, file);
      expect(methods.length, `no methods exported from ${rel}`).toBeGreaterThan(0);

      for (const method of methods) {
        entries.push({
          path: '/api/' + rel,
          method,
          auth,
          routeClass,
          isPublic:
            routeClass === 'token_gated_public' || routeClass === 'public_unauthenticated',
          isMutation: MUTATION_METHODS.has(method),
          tenantSource,
          ownerResourceRule: ownerResourceRule(rel, routeClass, method),
        });
      }
    }

    fs.mkdirSync(artifactsDir, { recursive: true });
    const outPath = path.join(artifactsDir, 'route-matrix.json');
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: 'app/api/**/route.ts static scan',
          routeFileCount: files.length,
          entryCount: entries.length,
          entries,
        },
        null,
        2
      )
    );

    // Sanity invariants
    const tokenRoutes = entries.filter((e) => e.path.includes('/api/proposal/token/'));
    expect(tokenRoutes.length).toBeGreaterThan(0);
    for (const e of tokenRoutes) {
      expect(['token_gated_public', 'session_authenticated']).toContain(e.routeClass);
    }
    // Cron routes must reference cron auth
    for (const e of entries.filter((e) => e.routeClass === 'cron')) {
      expect(e.auth).toContain('verifyCronAuth');
    }
  });

  it('classifies x-tenant-id usage across the repo as internal-ops-only', () => {
    const scanDirs = ['app', 'lib'];
    const hits: { file: string; lines: number[] }[] = [];
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        if (entry.isDirectory()) scan(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('x-tenant-id')) {
            const lines = content
              .split('\n')
              .map((l, i) => (l.includes('x-tenant-id') ? i + 1 : -1))
              .filter((n) => n > 0);
            hits.push({ file: path.relative(rootDir, full), lines });
          }
        }
      }
    };
    for (const d of scanDirs) scan(path.join(rootDir, d));

    // x-tenant-id must only appear in the auth middleware (and its tests),
    // never as a caller-controlled tenant selector inside route handlers.
    const productionHits = hits.filter((h) => !/\.test\.ts$/.test(h.file));
    expect(productionHits.map((h) => h.file)).toEqual(['lib/middleware/auth.ts']);

    fs.writeFileSync(
      path.join(artifactsDir, 'x-tenant-id-usage.json'),
      JSON.stringify(
        {
          classification:
            'internal-ops-only: accepted solely when isInternalOpsRequest (shared secret) is true; ignored for env API key auth; never read by route handlers',
          productionFiles: productionHits,
          allFiles: hits,
        },
        null,
        2
      )
    );
  });
});
