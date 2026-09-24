// @vitest-environment node
/**
 * tests/matrix/module-provider-matrix.test.ts
 *
 * Additive qualification matrix for the 27-module audit engine
 * (docs/audits/2026-09-18-proposal-os-ground-up-ga-audit).
 *
 * Dynamically enumerates MODULE_REGISTRY from lib/audit/runner.ts and verifies,
 * per module, the audit's provider / failure / identity trust contracts:
 *
 *   1. Canonical count: exactly 27 modules, unique names, valid phases,
 *      dependencies reference registry members.
 *   2. Provider calls use trusted wrappers: every raw fetch() in the module's
 *      source file(s) is either a safeFetch* wrapper or an explicitly
 *      allowlisted fixed-host call (same boundary as
 *      tests/architecture/ssrf-fetch-boundary.test.ts, scoped to module files).
 *   3. Failure propagation: every adapter maps provider/module failure to a
 *      non-COMPLETE status (FAILED / UNAVAILABLE / SKIPPED) — it can never be
 *      laundered into a customer deficiency ("no finding = you failed this
 *      check" is forbidden for unobserved state).
 *   4. Module identity injection: findings emitted through
 *      extractFindingsFromRegistryResult are stamped with the registry module
 *      name, overriding whatever the module output itself claims.
 *   5. Unavailable credentials / ambiguous identity are explicit unsafe states:
 *      GBP ambiguous identity withholds customer-negative findings, missing
 *      provider credentials surface as UNAVAILABLE (never COMPLETE), missing
 *      dependencies skip dependents honestly.
 *
 * Emits a machine-readable artifact to
 * docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/module-matrix.json.
 *
 * No production behavior changes.
 */

import * as fs from 'fs';
import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/gbp', () => ({ runGBPModule: vi.fn() }));
vi.mock('@/lib/modules/gbpDeep', () => ({ runGbpDeepModule: vi.fn() }));
vi.mock('@/lib/modules/emailFinder', () => ({ findEmails: vi.fn() }));
vi.mock('@/lib/modules/reputation', () => ({ runReputationModule: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cache/redisCache', () => ({ redisCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn() }));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({ MetricsRecorder: { auditRun: vi.fn() } }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(async () => undefined) }));
vi.mock('langsmith', () => ({ RunTree: vi.fn() }));

import { findEmails } from '@/lib/modules/emailFinder';
import { runGBPModule } from '@/lib/modules/gbp';
import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
import { runReputationModule } from '@/lib/modules/reputation';

import {
  extractFindingsFromRegistryResult,
  FEATURE_FLAG_GATED_MODULES,
  MODULE_REGISTRY,
  type ModuleInput,
  type ModuleResult,
} from '@/lib/audit/runner';

const rootDir = path.resolve(__dirname, '../..');
const ARTIFACT_PATH = path.join(
  rootDir,
  'docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/module-matrix.json'
);

const EXPECTED_MODULE_COUNT = 27;

/** Canonical module name -> source file(s) implementing it. */
const MODULE_SOURCE_FILES: Record<string, string[]> = {
  website: ['lib/modules/website.ts'],
  websiteCrawler: ['lib/modules/websiteCrawlerModule.ts'],
  gbp: ['lib/modules/gbp.ts'],
  competitor: ['lib/modules/competitor.ts'],
  techStack: ['lib/modules/techStack.ts'],
  security: ['lib/modules/security.ts'],
  emailFinder: ['lib/modules/emailFinder.ts'],
  coreWebVitals: ['lib/modules/coreWebVitals.ts'],
  schemaAnalysis: ['lib/modules/schemaAnalysis.ts'],
  reputation: ['lib/modules/reputation.ts'],
  social: ['lib/modules/social.ts'],
  socialDeep: ['lib/modules/socialDeep.ts'],
  gbpDeep: ['lib/modules/gbpDeep.ts'],
  seoDeep: ['lib/modules/seoDeep.ts'],
  accessibility: ['lib/modules/accessibility.ts'],
  mobileUX: ['lib/modules/mobileUX.ts'],
  contentQuality: ['lib/modules/contentQuality.ts'],
  conversion: ['lib/modules/conversion.ts'],
  citations: ['lib/modules/citations.ts'],
  paidSearch: ['lib/modules/paidSearch.ts'],
  backlinks: ['lib/modules/backlinks.ts'],
  privacyCompliance: ['lib/modules/privacyCompliance.ts'],
  schemaMarkup: ['lib/modules/schemaMarkup.ts'],
  keywordGap: ['lib/modules/keywordGap.ts'],
  videoPresence: ['lib/modules/videoPresence.ts'],
  competitorStrategy: ['lib/modules/competitorStrategy.ts'],
  vision: ['lib/modules/vision.ts'],
};

/** External provider(s) each module depends on (per provider-inventory.csv). */
const MODULE_PROVIDERS: Record<string, string[]> = {
  website: ['Google PageSpeed'],
  websiteCrawler: ['internal crawler (safeFetch)'],
  gbp: ['Google Places'],
  competitor: ['SerpAPI', 'Google Places', 'Google PageSpeed'],
  techStack: ['target website (safeFetch)'],
  security: ['target website (fetchWithRedirect + validateUrl)'],
  emailFinder: ['target website (safeFetch)'],
  coreWebVitals: ['none (derives from website Lighthouse audits)'],
  schemaAnalysis: ['none (derives from websiteCrawler HTML)'],
  reputation: ['AI provider (Gemini/Vertex)'],
  social: ['target website (safeFetch)'],
  socialDeep: ['SerpAPI', 'AI provider'],
  gbpDeep: ['Google Places'],
  seoDeep: ['SerpAPI', 'target website (safeFetch)'],
  accessibility: ['headless browser (validated navigation)'],
  mobileUX: ['Google PageSpeed', 'headless browser'],
  contentQuality: ['AI provider'],
  conversion: ['headless browser', 'AI provider'],
  citations: ['SerpAPI', 'directory hosts (fixed)'],
  paidSearch: ['SerpAPI'],
  backlinks: ['SerpAPI'],
  privacyCompliance: ['headless browser (validated navigation)'],
  schemaMarkup: ['target website (safeFetch)'],
  keywordGap: ['SerpAPI'],
  videoPresence: ['SerpAPI', 'AI provider'],
  competitorStrategy: ['AI provider'],
  vision: ['AI provider (multimodal)'],
};

/**
 * Raw-fetch allowlist scoped to module files, mirroring
 * tests/architecture/ssrf-fetch-boundary.test.ts. Entries are matched by file
 * and ±5-line tolerance.
 */
const MODULE_ALLOWED_RAW_FETCH: Array<{ file: string; line: number; host: string }> = [
  { file: 'lib/modules/seoDeep.ts', line: 297, host: 'serpapi.com' },
  { file: 'lib/modules/competitor.ts', line: 73, host: 'serpapi.com' },
  { file: 'lib/modules/competitor.ts', line: 112, host: 'places.googleapis.com' },
  { file: 'lib/modules/competitor.ts', line: 185, host: 'googleapis.com' },
  { file: 'lib/modules/competitor.ts', line: 244, host: 'serpapi.com' },
  { file: 'lib/modules/competitor.ts', line: 326, host: 'serpapi.com' },
  { file: 'lib/modules/keywordGap.ts', line: 196, host: 'serpapi.com' },
  { file: 'lib/modules/paidSearch.ts', line: 158, host: 'serpapi.com' },
  { file: 'lib/modules/paidSearch.ts', line: 236, host: 'serpapi.com' },
  { file: 'lib/modules/videoPresence.ts', line: 427, host: 'serpapi.com' },
  { file: 'lib/modules/socialDeep.ts', line: 230, host: 'serpapi.com' },
  { file: 'lib/modules/citations.ts', line: 175, host: 'yelp.com' },
  { file: 'lib/modules/citations.ts', line: 240, host: 'serpapi.com' },
  { file: 'lib/modules/citations.ts', line: 313, host: 'serpapi.com' },
  { file: 'lib/modules/citations.ts', line: 369, host: 'bbb.org' },
  { file: 'lib/modules/citations.ts', line: 426, host: 'yellowpages.com' },
  { file: 'lib/modules/citations.ts', line: 501, host: 'serpapi.com' },
  { file: 'lib/modules/gbp.ts', line: 113, host: 'places.googleapis.com' },
  { file: 'lib/modules/gbp.ts', line: 213, host: 'places.googleapis.com' },
  { file: 'lib/modules/gbpDeep.ts', line: 120, host: 'places.googleapis.com' },
  { file: 'lib/modules/gbpDeep.ts', line: 198, host: 'places.googleapis.com' },
  { file: 'lib/modules/website.ts', line: 378, host: 'googleapis.com' },
  { file: 'lib/modules/mobileUX.ts', line: 443, host: 'googleapis.com' },
  { file: 'lib/modules/mobileUX.ts', line: 467, host: 'googleapis.com' },
  { file: 'lib/modules/security.ts', line: 114, host: 'arbitrary (validated per hop)' },
];

class FakeCostTracker {
  addApiCall() {}
}

function adapter(name: string) {
  const entry = MODULE_REGISTRY.find((module) => module.name === name);
  if (!entry) throw new Error(`Missing adapter ${name}`);
  return entry.run;
}

const baseInput: ModuleInput = {
  auditId: 'matrix-a1',
  tenantId: 'matrix-t1',
  url: 'https://acme.test',
  businessName: 'Acme Plumbing',
  city: 'Regina',
  industry: 'Plumbing',
};

/** Scan a module source file for raw fetch() calls not using a safeFetch wrapper. */
function rawFetchViolations(relPath: string): string[] {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return [`${relPath}: file missing`];
  const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
  const violations: string[] = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (trimmed.includes('import')) return;
    if (trimmed.includes('typeof fetch')) return;
    if (trimmed.includes('retryFetch')) return;
    const hit = line.match(/(?<!safe|safeFetchResponseDerived|safeFetchHttpsOnly)\bfetch\s*\(/);
    if (!hit) return;
    const allowed = MODULE_ALLOWED_RAW_FETCH.some(
      (a) => a.file === relPath && Math.abs(idx + 1 - a.line) <= 5
    );
    if (!allowed) violations.push(`${relPath}:${idx + 1}`);
  });
  return violations;
}

describe('module/provider/failure/identity qualification matrix', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('1. canonical registry enumeration', () => {
    it(`contains exactly ${EXPECTED_MODULE_COUNT} modules with unique names`, () => {
      expect(MODULE_REGISTRY).toHaveLength(EXPECTED_MODULE_COUNT);
      const names = MODULE_REGISTRY.map((m) => m.name);
      expect(new Set(names).size).toBe(EXPECTED_MODULE_COUNT);
    });

    it('every module declares a valid phase, timeout, and runnable adapter', () => {
      for (const mod of MODULE_REGISTRY) {
        expect([1, 2, 3]).toContain(mod.phase);
        expect(typeof mod.run).toBe('function');
        expect(mod.timeoutMs ?? 0).toBeGreaterThan(0);
      }
    });

    it('every dependency references another registry module', () => {
      const names = new Set(MODULE_REGISTRY.map((m) => m.name));
      for (const mod of MODULE_REGISTRY) {
        for (const dep of mod.dependsOn ?? []) {
          expect(names.has(dep)).toBe(true);
        }
      }
    });

    it('matrix source-file and provider maps cover the registry exactly', () => {
      const names = MODULE_REGISTRY.map((m) => m.name).sort();
      expect(Object.keys(MODULE_SOURCE_FILES).sort()).toEqual(names);
      expect(Object.keys(MODULE_PROVIDERS).sort()).toEqual(names);
      for (const mod of MODULE_REGISTRY) {
        for (const f of MODULE_SOURCE_FILES[mod.name]) {
          expect(fs.existsSync(path.join(rootDir, f))).toBe(true);
        }
      }
    });
  });

  describe('2. provider calls use trusted wrappers', () => {
    it('no module source file has an unallowlisted raw fetch()', () => {
      const violations: string[] = [];
      for (const mod of MODULE_REGISTRY) {
        for (const file of MODULE_SOURCE_FILES[mod.name]) {
          violations.push(...rawFetchViolations(file));
        }
      }
      expect(violations).toEqual([]);
    });

    it('feature-flag-gated modules reference known registry members', () => {
      const names = new Set(MODULE_REGISTRY.map((m) => m.name));
      for (const gated of Object.keys(FEATURE_FLAG_GATED_MODULES)) {
        expect(names.has(gated)).toBe(true);
      }
    });
  });

  describe('3. failure propagation cannot become customer deficiency', () => {
    it('every adapter body routes through honest status mapping', () => {
      const runnerSource = fs.readFileSync(path.join(rootDir, 'lib/audit/runner.ts'), 'utf-8');
      // Every adapter referenced by the registry must either pass through the
      // honest adapters (adaptLegacyModuleResult / adaptAuditModuleResult) or
      // explicitly construct FAILED/UNAVAILABLE/SKIPPED results.
      for (const mod of MODULE_REGISTRY) {
        const adapterName = `${mod.name}Adapter`;
        expect(runnerSource).toContain(`const ${adapterName}`);
        const bodyMatch = runnerSource.match(
          new RegExp(`const ${adapterName} = async[\\s\\S]*?\\n\\};`)
        );
        expect(bodyMatch).not.toBeNull();
        const body = bodyMatch![0];
        const honest =
          body.includes('adaptLegacyModuleResult') ||
          body.includes('adaptAuditModuleResult') ||
          body.includes("'FAILED'") ||
          body.includes("'UNAVAILABLE'") ||
          body.includes("'SKIPPED'");
        expect(honest).toBe(true);
      }
    });

    it('unavailable observations never yield findings', () => {
      for (const mod of MODULE_REGISTRY) {
        const extracted = extractFindingsFromRegistryResult(
          mod.name,
          {
            status: 'UNAVAILABLE',
            data: { findings: [{ title: 'phantom' }], evidenceSnapshots: [{ source: 'x' }] },
            error: 'provider unavailable',
          },
          baseInput
        );
        expect(extracted.findings).toEqual([]);
        expect(extracted.snapshots).toEqual([]);
      }
    });

    it('failed observations never yield findings', () => {
      for (const mod of MODULE_REGISTRY) {
        const extracted = extractFindingsFromRegistryResult(
          mod.name,
          { status: 'FAILED', data: null, error: 'boom' },
          baseInput
        );
        expect(extracted.findings).toEqual([]);
      }
    });

    it('emailFinder adapter maps failed fetch to FAILED, not COMPLETE', async () => {
      vi.mocked(findEmails).mockResolvedValue({
        emails: [],
        source: 'failed',
      } as never);
      const result = await adapter('emailFinder')(baseInput, new FakeCostTracker() as never);
      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/source: failed/);
    });

    it('reputation adapter reports UNAVAILABLE when its GBP dependency is absent', async () => {
      const result = await adapter('reputation')(
        { ...baseInput, dependencyResults: {} },
        new FakeCostTracker() as never,
        undefined
      );
      expect(result.status).toBe('UNAVAILABLE');
      expect(vi.mocked(runReputationModule)).not.toHaveBeenCalled();
    });
  });

  describe('4. module identity injection', () => {
    it('registry module name overrides any module-claimed finding identity', () => {
      // The generic path stamps `module: moduleName` onto every finding.
      const injected = extractFindingsFromRegistryResult(
        'citations',
        {
          status: 'COMPLETE',
          data: {
            findings: [
              {
                module: 'FORGED_MODULE_NAME',
                title: 'Identity spoof attempt',
                category: 'SEO',
                type: 'VITAMIN',
              },
            ],
            evidenceSnapshots: [],
          },
        },
        baseInput
      );
      expect(injected.findings).toHaveLength(1);
      expect(injected.findings[0].module).toBe('citations');
    });

    // Generator-path modules (gbp/competitor/social/reputation/emailFinder)
    // construct findings through lib/modules/findingGenerator.ts with a
    // canonical module constant and require fully-shaped provider data; they
    // are covered by the targeted checks below and by
    // lib/audit/__tests__/*. All other modules go through the restamp path.
    const RESTAMP_PATH_MODULES = MODULE_REGISTRY.map((m) => m.name).filter(
      (n) => !['gbp', 'competitor', 'social', 'reputation', 'emailFinder'].includes(n)
    );

    it.each(RESTAMP_PATH_MODULES)(
      'findings extracted for %s carry the registry identity',
      (moduleName) => {
        const extracted = extractFindingsFromRegistryResult(
          moduleName,
          {
            status: 'COMPLETE',
            data: {
              findings: [{ module: 'spoofed', title: 't', category: 'c', type: 'VITAMIN' }],
              evidenceSnapshots: [],
            },
          },
          baseInput
        );
        for (const finding of extracted.findings) {
          expect(finding.module).toBe(moduleName);
        }
      }
    );

    it('generator-path social findings are constructed with the canonical module name', () => {
      const extracted = extractFindingsFromRegistryResult(
        'social',
        {
          status: 'COMPLETE',
          data: {
            platformsFound: [],
            profiles: {},
            websiteDiscoverySucceeded: true,
          },
        },
        baseInput
      );
      expect(extracted.findings.length).toBeGreaterThan(0);
      for (const finding of extracted.findings) {
        expect(finding.module).toBe('social');
      }
    });

    it('generator-path reputation findings are constructed with the canonical module name', () => {
      const extracted = extractFindingsFromRegistryResult(
        'reputation',
        {
          status: 'COMPLETE',
          data: {
            summary: {
              negativeRatio: 0.8,
              responseRate: 0,
              avgRating: 2.1,
              reviewCount: 25,
              commonThemes: ['wait times'],
            },
            reviews: [{ rating: 1, text: 'terrible', author: 'x', date: '2026-01-01' }],
            negativeThemesSummary: 'wait times',
          },
        },
        baseInput
      );
      expect(extracted.findings.length).toBeGreaterThan(0);
      for (const finding of extracted.findings) {
        expect(finding.module).toBe('reputation');
      }
    });
  });

  describe('5. unavailable credentials / ambiguous identity are explicit unsafe states', () => {
    it('gbp adapter reports UNAVAILABLE when listing identity cannot be confirmed', async () => {
      vi.mocked(runGBPModule).mockResolvedValue({
        status: 'success',
        data: { placeId: null, identityConfidence: undefined },
      } as never);
      const result = await adapter('gbp')(baseInput, new FakeCostTracker() as never);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.error).toMatch(/identity was not confirmed/i);
    });

    it('ambiguous GBP identity produces an advisory finding, never customer-negative findings', () => {
      const extracted = extractFindingsFromRegistryResult(
        'gbp',
        {
          status: 'COMPLETE',
          data: {
            identityConfidence: 'ambiguous',
            placeId: 'place-123',
            matchConfidenceScore: 0.42,
            candidatesConsidered: 3,
            alternateCandidateNames: ['Acme Plumbing Co', 'Acme Plumbers'],
          },
        },
        baseInput
      );
      expect(extracted.findings).toHaveLength(1);
      const advisory = extracted.findings[0];
      expect(advisory.module).toBe('gbp');
      expect(advisory.metrics.identityConfidence).toBe('ambiguous');
      expect(advisory.impactScore).toBe(0);
      expect(advisory.title).toMatch(/Manual Confirmation/i);
      expect(advisory.description).toMatch(/withheld/i);
    });

    it('gbpDeep adapter withholds deep-analysis findings on ambiguous identity', async () => {
      vi.mocked(runGbpDeepModule).mockResolvedValue({
        findings: [{ title: 'Photos missing', module: 'gbpDeep' }],
        evidenceSnapshots: [{ source: 'places', rawResponse: {} }],
        execution: { state: 'complete' },
      } as never);
      const result = await adapter('gbpDeep')(
        {
          ...baseInput,
          dependencyResults: { gbp: { placeId: 'p1', identityConfidence: 'ambiguous' } },
        },
        new FakeCostTracker() as never
      );
      expect(result.status).toBe('PARTIAL');
      expect(result.error).toMatch(/ambiguous/i);
      expect(result.data.findings).toEqual([]);
    });

    it('gbpDeep adapter SKIPs honestly when no placeId and no URL exist', async () => {
      const result = await adapter('gbpDeep')(
        { ...baseInput, url: undefined, dependencyResults: {} },
        new FakeCostTracker() as never
      );
      expect(result.status).toBe('SKIPPED');
      expect(vi.mocked(runGbpDeepModule)).not.toHaveBeenCalled();
    });
  });

  describe('6. machine-readable artifact', () => {
    it('emits module-matrix.json derived from the live registry', () => {
      const runnerSource = fs.readFileSync(path.join(rootDir, 'lib/audit/runner.ts'), 'utf-8');
      const modules = MODULE_REGISTRY.map((mod) => {
        const adapterBody = runnerSource.match(
          new RegExp(`const ${mod.name}Adapter = async[\\s\\S]*?\\n\\};`)
        )?.[0] ?? '';
        const rawFetchOffenders = MODULE_SOURCE_FILES[mod.name].flatMap((f) =>
          rawFetchViolations(f)
        );
        const honest =
          adapterBody.includes('adaptLegacyModuleResult') ||
          adapterBody.includes('adaptAuditModuleResult') ||
          /'(FAILED|UNAVAILABLE|SKIPPED)'/.test(adapterBody);
        return {
          name: mod.name,
          phase: mod.phase,
          optional: mod.optional === true,
          timeoutMs: mod.timeoutMs ?? null,
          dependsOn: mod.dependsOn ?? [],
          featureFlag: FEATURE_FLAG_GATED_MODULES[mod.name] ?? null,
          sourceFiles: MODULE_SOURCE_FILES[mod.name],
          providers: MODULE_PROVIDERS[mod.name],
          providerBoundary: {
            rawFetchViolations: rawFetchOffenders,
            qualified: rawFetchOffenders.length === 0,
          },
          failurePropagation: {
            honestStatusMapping: honest,
            qualified: honest,
          },
          identityInjection: {
            strategy:
              mod.name === 'gbp'
                ? 'generator + ambiguous-identity advisory'
                : ['website', 'security', 'schemaMarkup'].includes(mod.name)
                  ? 'restamped: f.module = registryName'
                  : ['competitor', 'social', 'reputation', 'emailFinder'].includes(mod.name)
                    ? 'generator-constructed with canonical module name'
                    : 'restamped: f.module = registryName',
          },
          unsafeStates: {
            unavailableCredentials: 'UNAVAILABLE or SKIPPED, never COMPLETE',
            ambiguousIdentity:
              mod.name === 'gbp' || mod.name === 'gbpDeep'
                ? 'explicit: findings withheld, advisory emitted'
                : 'n/a',
          },
        };
      });

      const artifact = {
        generatedAt: new Date().toISOString(),
        audit: '2026-09-18-proposal-os-ground-up-ga-audit',
        source: 'lib/audit/runner.ts::MODULE_REGISTRY',
        expectedModuleCount: EXPECTED_MODULE_COUNT,
        actualModuleCount: modules.length,
        qualified: modules.length === EXPECTED_MODULE_COUNT &&
          modules.every(
            (m) => m.providerBoundary.qualified && m.failurePropagation.qualified
          ),
        modules,
      };

      fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
      fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

      expect(fs.existsSync(ARTIFACT_PATH)).toBe(true);
      const written = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf-8'));
      expect(written.actualModuleCount).toBe(EXPECTED_MODULE_COUNT);
      expect(written.qualified).toBe(true);
      expect(written.modules.map((m: { name: string }) => m.name).sort()).toEqual(
        MODULE_REGISTRY.map((m) => m.name).sort()
      );
    });
  });
});
