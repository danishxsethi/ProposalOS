import { createHash } from 'crypto';

import { RunTree } from 'langsmith';

import { runWithConcurrency } from '@/lib/audit/concurrency';
import {
  normalizeAndValidateModuleFindings,
  type RejectedFinding,
} from '@/lib/audit/findingContract';
import { persistFindings } from '@/lib/audit/findingPersistence';
import { redisCache } from '@/lib/cache/redisCache';
import { FEATURE_FLAGS, isFeatureEnabledEffective } from '@/lib/config/feature-flags';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import {
  generateCompetitorFindings,
  generateGBPFindings,
  generateReputationFindings,
  generateSocialFindings,
  generateWebsiteFindings,
} from '@/lib/modules/findingGenerator';
import { createEvidence } from '@/lib/modules/types';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { withChildObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import { detectVertical } from '@/lib/playbooks';
import { prisma } from '@/lib/prisma';
import { withTenantRuntimeContext } from '@/lib/tenant/context';
import { createParentTrace } from '@/lib/tracing';

// --- Step 1: Import all modules ---
import { CANONICAL_MODULES as CRITICAL_COMPLETION_MODULES } from './modules';
import { runAccessibilityModule } from '../modules/accessibility';
import { runBacklinksModule } from '../modules/backlinks';
import { runCitationsModule } from '../modules/citations';
import { runCompetitorModule } from '../modules/competitor';
import { runCompetitorStrategyModule } from '../modules/competitorStrategy';
import { runContentQualityModule } from '../modules/contentQuality';
import { runConversionModule } from '../modules/conversion';
import { extractCoreWebVitalsFromAudits } from '../modules/coreWebVitals';
import { findEmails as runEmailFinderModule } from '../modules/emailFinder';
import { runGBPModule as runGbpModule } from '../modules/gbp';
import { runGbpDeepModule } from '../modules/gbpDeep';
import { runKeywordGapModule } from '../modules/keywordGap';
import { runMobileUXModule } from '../modules/mobileUX';
import { runPaidSearchModule } from '../modules/paidSearch';
import { runPrivacyModule as runPrivacyComplianceModule } from '../modules/privacyCompliance';
import { runReputationModule } from '../modules/reputation';
import { analyzeSchemaMarkup } from '../modules/schemaAnalysis';
import { runSchemaMarkupModule } from '../modules/schemaMarkup';
import { runSecurityModule } from '../modules/security';
import { runSeoDeepModule } from '../modules/seoDeep';
import { runSocialModule } from '../modules/social';
import { runSocialDeepModule } from '../modules/socialDeep';
import { runTechStackModule } from '../modules/techStack';
import { runVideoModule as runVideoPresenceModule } from '../modules/videoPresence';
import { runVisionModule } from '../modules/vision';
import { runWebsiteModule } from '../modules/website';
import { runWebsiteCrawlerModule } from '../modules/websiteCrawlerModule';

// finding generators for legacy modules

export interface ModuleInput {
  auditId: string;
  url?: string;
  businessName?: string;
  city?: string;
  industry?: string;
  dependencyResults?: Record<string, any>;
  tenantId: string;
  signal?: AbortSignal;
}

export interface ModuleResult {
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  data: any;
  error?: string;
  cost?: number;
}

// --- Step 2: Define the 3-phase execution plan ---

interface ModuleConfig {
  name: string;
  phase: 1 | 2 | 3;
  run: (input: ModuleInput, costTracker: CostTracker, parentTrace?: any) => Promise<ModuleResult>;
  dependsOn?: string[];
  optional?: boolean;
  timeoutMs?: number;
}

function adaptAuditModuleResult(data: {
  execution?: {
    state: 'complete' | 'partial' | 'unavailable' | 'failed';
    reason?: string;
  };
}): ModuleResult {
  switch (data.execution?.state) {
    case 'partial':
      return { status: 'PARTIAL', data, error: data.execution.reason };
    case 'unavailable':
      return {
        status: 'SKIPPED',
        data,
        error: `UNAVAILABLE: ${data.execution.reason || 'provider unavailable'}`,
      };
    case 'failed':
      return { status: 'FAILED', data: null, error: data.execution.reason || 'Module failed' };
    default:
      return { status: 'COMPLETE', data };
  }
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', onAbort, { once: true });
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'AbortError')),
    timeoutMs
  );

  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError')),
      { once: true }
    );
  });

  try {
    return await Promise.race([run(controller.signal), aborted]);
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', onAbort);
  }
}

// Adapters to normalize the diverse module inputs/outputs into the standard ModuleResult
const websiteAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  // P1-27 (Wave 7): forward auditId so runWebsiteModule's internal crawl call and
  // the sibling `websiteCrawler` module's own call coalesce into one real crawl
  // (see lib/modules/websiteCrawlerModule.ts's single-flight cache).
  const data = await runWebsiteModule({ url: input.url, auditId: input.auditId }, tracker);
  return { status: 'COMPLETE', data };
};

const websiteCrawlerAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName) throw new Error('url and businessName required');
  const data = await runWebsiteCrawlerModule(
    {
      url: input.url,
      businessName: input.businessName,
      auditId: input.auditId,
      signal: input.signal,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const gbpAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('businessName and city required');
  const raw = await runGbpModule(
    { businessName: input.businessName, city: input.city, websiteUrl: input.url },
    tracker
  );
  const legacy = raw as unknown as Record<string, any>;
  // P1-33-adjacent adapter defect (Wave 3, Step 8): the module's own success/failure
  // signal (LegacyAuditModuleResult.status) must not be discarded — a "not found"/error
  // result is a real module failure/absence, never a silent COMPLETE. Provider failure
  // must never be masked into an apparently-successful module result.
  if (legacy?.status === 'failed' || legacy?.status === 'error') {
    return { status: 'FAILED', data: null, error: legacy.error || 'GBP module reported failure' };
  }
  return { status: 'COMPLETE', data: legacy?.data ?? legacy };
};

const competitorAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('keyword and location required');
  const raw = await runCompetitorModule(
    { keyword: input.businessName, location: input.city },
    tracker
  );
  const legacy = raw as unknown as Record<string, any>;
  // Same adapter defect as gbpAdapter above — the module's own failure status was being
  // silently discarded, reporting COMPLETE regardless (Wave 3, Step 8).
  if (legacy?.status === 'failed' || legacy?.status === 'error') {
    return {
      status: 'FAILED',
      data: null,
      error: legacy.error || 'Competitor module reported failure',
    };
  }
  if (legacy?.data?.execution?.state === 'unavailable') {
    return {
      status: 'SKIPPED',
      data: legacy.data,
      error: `UNAVAILABLE: ${legacy.data.execution.reason || 'Competitor providers unavailable'}`,
    };
  }
  return { status: 'COMPLETE', data: legacy?.data ?? legacy };
};

const techStackAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runTechStackModule({ url: input.url, signal: input.signal }, tracker);
  return { status: 'COMPLETE', data };
};

const securityAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runSecurityModule(
    {
      url: input.url,
      tenantId: input.tenantId,
      signal: input.signal,
    },
    tracker
  );
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const emailFinderAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runEmailFinderModule(input.url, tracker, input.signal);
  // P2-28 (Wave 5): `findEmails()` (lib/modules/emailFinder.ts) never returns a
  // `status` field — the previous `data.status === 'error'` check was dead code that
  // could never fire, letting a total fetch failure (source: 'failed'/'error', empty
  // emails) report COMPLETE with an empty result indistinguishable from a genuine
  // "page fetched successfully, no public emails found" outcome. `findEmails`'s real
  // signal is its `source` field: 'failed' (fetch/provider unavailable) and 'error'
  // (unexpected exception during scan) are both real implementation failure, never a
  // verified absence of emails.
  if (data.source === 'failed' || data.source === 'error') {
    return {
      status: 'FAILED',
      data: null,
      error: `Email discovery failed (source: ${data.source})`,
    };
  }
  return { status: 'COMPLETE', data };
};

const reputationAdapter = async (
  input: ModuleInput,
  tracker: CostTracker,
  trace: any
): Promise<ModuleResult> => {
  const gbpData = input.dependencyResults?.gbp;
  if (!gbpData?.reviews || gbpData.reviews.length === 0)
    return { status: 'SKIPPED', data: null, error: 'No reviews found' };
  const data = await runReputationModule(
    { reviews: gbpData.reviews, businessName: input.businessName || 'Unknown' },
    tracker,
    trace
  );
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const socialAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url || !input.businessName) throw new Error('url and businessName required');
  const data = await runSocialModule(
    { websiteUrl: input.url, businessName: input.businessName },
    tracker
  );
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const socialDeepAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('Missing input');
  const socialData = input.dependencyResults?.social;
  const discoveredUrls = socialData?.discoveredUrls || [];
  const data = await runSocialDeepModule(
    {
      websiteUrl: input.url,
      businessName: input.businessName,
      city: input.city,
      industry: input.industry || 'Generic',
      discoveredUrls,
      websiteDiscoverySucceeded: socialData?.skipped !== true,
      signal: input.signal,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

const gbpDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  const gbpData = input.dependencyResults?.gbp;
  if (!gbpData?.placeId && !input.url)
    return { status: 'SKIPPED', data: null, error: 'No placeId or URL' };
  const data = await runGbpDeepModule(
    {
      placeId: gbpData?.placeId,
      websiteUrl: input.url,
      businessName: input.businessName || 'Unknown',
      city: input.city || 'Unknown',
      placeData: gbpData,
      signal: input.signal,
    },
    tracker
  );
  const result = adaptAuditModuleResult(data);
  // P1-29 (Wave 7): if the canonical GBP dependency could not confirm the business
  // identity with confidence, gbpDeep's own reviews/photos/completeness analysis
  // may describe the wrong business entirely. The `gbp` module's own advisory
  // finding (extractFindingsFromRegistryResult) already discloses this to the
  // customer — gbpDeep's deep-analysis findings are withheld here rather than
  // duplicated or presented as definitive.
  if (gbpData?.identityConfidence === 'ambiguous' && result.status === 'COMPLETE') {
    return {
      status: 'PARTIAL',
      data: { ...result.data, findings: [] },
      error: 'GBP identity match ambiguous — deep-analysis findings withheld',
    };
  }
  return result;
};

const seoDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  // P1-35 (Wave 7): reuse the websiteCrawler dependency's already-crawled homepage
  // page metrics instead of independently re-fetching the same homepage.
  const crawlerData = input.dependencyResults?.websiteCrawler;
  const homepageCrawlPage = crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.crawledPages?.find(
    (p: { url?: string }) => p.url === input.url
  );
  const data = await runSeoDeepModule(
    {
      url: input.url,
      businessName: input.businessName || 'Unknown',
      city: input.city,
      homepageCrawlData: homepageCrawlPage ?? null,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const accessibilityAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runAccessibilityModule(
    { url: input.url, signal: input.signal, auditId: input.auditId },
    tracker
  );
  if (data.status === 'failed' || data.data?.status === 'error') {
    return {
      status: 'FAILED',
      data: null,
      error:
        data.error || data.data?.data?.recommendations?.[0] || 'Accessibility scan unavailable',
    };
  }
  return { status: 'COMPLETE', data };
};

const mobileUXAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  // P1-38 (Wave 7): reuse `website`'s already-fetched mobile PageSpeed score
  // instead of making a second, duplicate billable mobile PageSpeed call. Only
  // trusted when `website`'s own PageSpeed call genuinely succeeded — `coreWebVitals.full`
  // is only populated on the real success path (lib/modules/website.ts), never on
  // a missing-key or fetch-failure fallback — so a missing/failed website PageSpeed
  // check correctly falls through to mobileUX's own independent fetch attempt.
  const websiteData = input.dependencyResults?.website;
  const reusedMobileScore =
    websiteData?.coreWebVitals?.full && typeof websiteData?.scores?.performance === 'number'
      ? Math.round(websiteData.scores.performance * 100)
      : null;
  const data = await runMobileUXModule(
    {
      url: input.url,
      businessName: input.businessName || 'Unknown',
      signal: input.signal,
      reusedMobileScore,
      auditId: input.auditId,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

const contentQualityAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const crawlerData = input.dependencyResults?.websiteCrawler;
  const crawledPages = crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.crawledPages || [];
  const data = await runContentQualityModule(
    {
      url: input.url,
      businessName: input.businessName || 'Unknown',
      industry: input.industry || 'Generic',
      city: input.city || '',
      crawledPages,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const conversionAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runConversionModule(
    {
      url: input.url,
      businessName: input.businessName || 'Unknown',
      industry: input.industry,
      signal: input.signal,
      auditId: input.auditId,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const citationsAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('businessName and city required');
  const data = await runCitationsModule(
    { businessName: input.businessName, city: input.city },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const paidSearchAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const data = await runPaidSearchModule(
    {
      url: input.url,
      businessName: input.businessName,
      businessType: input.industry || 'Generic',
      city: input.city,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

const backlinksAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const data = await runBacklinksModule(
    {
      websiteUrl: input.url,
      businessName: input.businessName,
      city: input.city,
      signal: input.signal,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

const privacyComplianceAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runPrivacyComplianceModule(
    {
      url: input.url,
      businessName: input.businessName || 'Unknown',
      city: input.city || '',
      signal: input.signal,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

const schemaMarkupAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const gbpData = input.dependencyResults?.gbp;
  // P1-35 (Wave 7): reuse the homepage HTML the canonical `websiteCrawler`
  // dependency already fetched instead of independently re-fetching the same page.
  const crawlerData = input.dependencyResults?.websiteCrawler;
  const homepageHtml = crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.html ?? null;
  const raw = await runSchemaMarkupModule({
    url: input.url,
    businessName: input.businessName,
    gbpTypes: gbpData?.types,
    homepageHtml,
  });
  const legacy = raw as unknown as Record<string, any>;
  // P1-33 (Wave 5): `runSchemaMarkupModule` now reports its own outer status
  // honestly (fixed alongside P1-33 — fetch/parse failure used to always be
  // laundered into an outer 'success'). Provider/fetch failure must never be
  // reported as COMPLETE.
  if (legacy?.status === 'failed' || legacy?.status === 'error') {
    return { status: 'FAILED', data: null, error: legacy.error || 'Schema markup analysis failed' };
  }
  return { status: 'COMPLETE', data: legacy?.data ?? legacy };
};

const keywordGapAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const data = await runKeywordGapModule(
    {
      websiteUrl: input.url,
      businessName: input.businessName,
      city: input.city,
      industry: input.industry || 'Generic',
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

/**
 * P1-39 (Wave 5): the `competitor` module (lib/modules/competitor.ts) returns its real
 * competitor list under `data.topCompetitors` — never `data.results`, which does not
 * exist on the module's output shape. Every adapter that reads the competitor
 * dependency must use this one canonical field name; reading a nonexistent field
 * silently produces `undefined`, which both downstream adapters previously treated as
 * "no competitors" via `?.` chaining, discarding real, already-collected data instead
 * of forwarding it.
 */
function getCanonicalCompetitors(competitorDependencyData: unknown): Array<{
  name: string;
  website?: string;
  placeId?: string;
  rating?: number;
  reviews?: number;
}> {
  const list = (competitorDependencyData as Record<string, unknown> | undefined)?.topCompetitors;
  if (!Array.isArray(list)) return [];
  // Defensive: reject entries with an unrecognized/legacy shape (no `name`) rather
  // than silently passing through `undefined` fields to dependents.
  return list.filter(
    (
      c
    ): c is {
      name: string;
      website?: string;
      placeId?: string;
      rating?: number;
      reviews?: number;
    } => !!c && typeof c === 'object' && typeof (c as Record<string, unknown>).name === 'string'
  );
}

const videoPresenceAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('name, city required');
  const compData = input.dependencyResults?.competitor;
  const competitors = getCanonicalCompetitors(compData)
    .slice(0, 3)
    .map((c) => c.name);
  const data = await runVideoPresenceModule(
    {
      businessName: input.businessName,
      city: input.city,
      industry: input.industry || 'Generic',
      websiteUrl: input.url || '',
      competitors,
      signal: input.signal,
    },
    tracker
  );
  return adaptAuditModuleResult(data);
};

/** Normalize for self-exclusion comparison: lowercase, strip punctuation, collapse spaces. */
function normalizeBusinessName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const competitorStrategyAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const compData = input.dependencyResults?.competitor;
  // P2-47 (Wave 5): self-exclusion previously compared `title !== businessName` as an
  // exact string — any case, whitespace, or punctuation difference between the SERP
  // listing's title and the input business name (e.g. "Joe's Plumbing" vs "Joes
  // Plumbing Inc") let the subject business be selected as its own "competitor".
  // Normalize both sides the same way the `gbp` module already does for its own
  // name-consistency check (lib/modules/gbp.ts::normalize).
  const selfNormalized = normalizeBusinessName(input.businessName);
  const topComp = getCanonicalCompetitors(compData).find(
    (c): c is typeof c & { website: string } =>
      !!c.website && !!c.name && normalizeBusinessName(c.name) !== selfNormalized
  );
  if (!topComp) return { status: 'SKIPPED', data: null, error: 'No major competitor found' };
  const data = await runCompetitorStrategyModule(
    {
      businessName: input.businessName,
      industry: input.industry || 'Generic',
      city: input.city,
      websiteUrl: input.url,
      competitorName: topComp.name,
      competitorWebsite: topComp.website,
      competitorPlaceId: topComp.placeId,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const visionAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  const crawlerData = input.dependencyResults?.websiteCrawler;
  const screenshots =
    crawlerData?.evidenceSnapshots?.filter((s: any) => s.type === 'screenshot') || [];
  if (screenshots.length === 0)
    return { status: 'SKIPPED', data: null, error: 'No screenshots captured' };
  const data = await runVisionModule(
    {
      auditId: input.auditId,
      businessName: input.businessName || 'Unknown',
      industry: input.industry || 'Generic',
      screenshots,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

// P1-7: Adapters for previously dead modules — using existing utility functions
const coreWebVitalsAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  // Reads from the website (PageSpeed) module output which contains Lighthouse audits
  const websiteData = input.dependencyResults?.website;
  const lighthouseAudits =
    websiteData?.lighthouseResult?.audits ??
    websiteData?.audits ??
    websiteData?.data?.lighthouseResult?.audits ??
    null;
  if (!lighthouseAudits)
    return {
      status: 'SKIPPED',
      data: null,
      error: 'No Lighthouse audit data available from website module',
    };

  const cwv = extractCoreWebVitalsFromAudits(lighthouseAudits);

  // Generate findings based on CWV ratings
  const findings: any[] = [];
  if (cwv.lcp && cwv.lcp.rating !== 'good') {
    findings.push({
      module: 'coreWebVitals',
      category: 'Performance',
      type: cwv.lcp.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN',
      title: `Largest Contentful Paint: ${cwv.lcp.value.toFixed(2)}s`,
      description: `LCP is ${cwv.lcp.rating} (threshold: good < ${cwv.lcp.thresholdGood}s). Slow LCP hurts SEO rankings and user experience.`,
      impactScore: cwv.lcp.rating === 'poor' ? 8 : 5,
      confidenceScore: 95,
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Optimize images',
        'Add proper caching',
        'Use a CDN',
        'Reduce server response time',
      ],
    });
  }
  if (cwv.cls && cwv.cls.rating !== 'good') {
    findings.push({
      module: 'coreWebVitals',
      category: 'Performance',
      type: cwv.cls.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN',
      title: `Cumulative Layout Shift: ${cwv.cls.value.toFixed(3)}`,
      description: `CLS is ${cwv.cls.rating} (threshold: good < ${cwv.cls.thresholdGood}). Layout shifts hurt UX and SEO.`,
      impactScore: cwv.cls.rating === 'poor' ? 7 : 4,
      confidenceScore: 95,
      effortEstimate: 'MEDIUM',
      recommendedFix: [
        'Set explicit width/height on images',
        'Avoid inserting content above existing content',
        'Use CSS transform for animations',
      ],
    });
  }
  if (cwv.tbt && cwv.tbt.rating !== 'good') {
    findings.push({
      module: 'coreWebVitals',
      category: 'Performance',
      type: cwv.tbt.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN',
      title: `Total Blocking Time: ${cwv.tbt.value}ms`,
      description: `TBT is ${cwv.tbt.rating} (threshold: good < ${cwv.tbt.thresholdGood}ms). High TBT means the main thread is blocked, delaying user interaction.`,
      impactScore: cwv.tbt.rating === 'poor' ? 7 : 4,
      confidenceScore: 90,
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Break up long tasks',
        'Defer non-critical JavaScript',
        'Reduce third-party scripts',
      ],
    });
  }
  // P2-44: extractCoreWebVitalsFromAudits already computes cwv.inp from the same
  // Lighthouse run as lcp/cls/tbt above, but no finding was ever emitted for it —
  // INP (Interaction to Next Paint) replaced FID as the Core Web Vital for
  // responsiveness in 2024, so a missing INP finding under-reports real UX issues.
  if (cwv.inp && cwv.inp.rating !== 'good') {
    const collectedAt = new Date().toISOString();
    findings.push({
      module: 'coreWebVitals',
      category: 'Performance',
      type: cwv.inp.rating === 'poor' ? 'PAINKILLER' : 'VITAMIN',
      title: `Interaction to Next Paint: ${Math.round(cwv.inp.value)}ms`,
      // Labeled as a single-run Lighthouse lab measurement (not CrUX real-user field
      // data) — this module has no field-data source, so it must not be presented
      // as observed real-user responsiveness.
      description: `INP (lab, single Lighthouse run) is ${cwv.inp.rating} (threshold: good < ${cwv.inp.thresholdGood}ms). Slow INP means clicks and taps feel sluggish to users.`,
      impactScore: cwv.inp.rating === 'poor' ? 6 : 4,
      confidenceScore: 8.5,
      evidence: [
        createEvidence({
          pointer: input.url || 'https://pagespeed.web.dev/',
          source: 'lighthouse_lab',
          collected_at: collectedAt,
          type: 'metric',
          value: cwv.inp.value,
          label: 'Interaction to Next Paint (single Lighthouse lab run)',
          raw: {
            formFactor: 'unknown',
            provenance: 'lab',
            unit: cwv.inp.unit,
            thresholdGood: cwv.inp.thresholdGood,
            thresholdPoor: cwv.inp.thresholdPoor,
          },
        }),
      ],
      metrics: {
        metric: 'INP',
        value: cwv.inp.value,
        unit: cwv.inp.unit,
        provenance: 'lighthouse_lab_single_run',
      },
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Break up long JavaScript tasks',
        'Reduce/defer third-party scripts',
        'Optimize event handlers',
      ],
    });
  }

  return {
    status: 'COMPLETE',
    data: {
      ...cwv,
      findings,
      evidenceSnapshots: [{ source: 'Core Web Vitals', rawResponse: cwv }],
    },
  };
};

const schemaAnalysisAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  // Reads the raw HTML captured by the websiteCrawler module
  const crawlerData = input.dependencyResults?.websiteCrawler;
  const rawHtml =
    crawlerData?.rawHtml ??
    crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.html ??
    crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.content ??
    null;
  if (!rawHtml || typeof rawHtml !== 'string') {
    return {
      status: 'SKIPPED',
      data: null,
      error: 'No raw HTML available from websiteCrawler module',
    };
  }

  const analysis = analyzeSchemaMarkup(rawHtml);
  const findings: any[] = [];

  // Generate findings for missing critical schema types
  //
  // P1-34 (Wave 5): each finding below carries `metrics.schemaFingerprint` identifying
  // its exact root cause (e.g. `schema-missing:LocalBusiness`) using the same key
  // scheme `schemaMarkup` (lib/modules/schemaMarkup.ts::buildSchemaMarkupFindings)
  // assigns for the identical observation from the same crawled HTML, so
  // `deduplicateFindings` merges true duplicates instead of presenting the customer
  // two near-identical "you're missing X schema" findings. This module's own
  // zero-evidence gap (these findings currently carry no `evidence`, so Wave 3's
  // contract rejects them before they can reach aggregation at all) is a separate,
  // pre-existing module-implementation defect out of Wave 5's adapter-repair scope —
  // tracked for Wave 6/7, not fixed here — but the fingerprint is added now so
  // dedup is already correct once that gap closes.
  if (!analysis.hasLocalBusinessOrOrganization.present) {
    findings.push({
      module: 'schemaAnalysis',
      category: 'SEO',
      type: 'PAINKILLER',
      title: 'Missing LocalBusiness/Organization Schema',
      description: analysis.hasLocalBusinessOrOrganization.recommendation,
      impactScore: 8,
      confidenceScore: 95,
      metrics: { schemaFingerprint: 'schema-missing:LocalBusiness' },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Add JSON-LD LocalBusiness schema with name, address, phone, hours, and geo coordinates',
      ],
    });
  }
  if (!analysis.hasReviewAggregateRating.present) {
    findings.push({
      module: 'schemaAnalysis',
      category: 'SEO',
      type: 'VITAMIN',
      title: 'Missing AggregateRating Schema',
      description: analysis.hasReviewAggregateRating.recommendation,
      impactScore: 5,
      confidenceScore: 90,
      metrics: { schemaFingerprint: 'schema-missing:AggregateRating' },
      effortEstimate: 'LOW',
      recommendedFix: [
        'Add AggregateRating schema referencing your review platform (Google, Yelp, etc.)',
      ],
    });
  }
  if (!analysis.hasFaq.present) {
    findings.push({
      module: 'schemaAnalysis',
      category: 'SEO',
      type: 'VITAMIN',
      title: 'No FAQPage Schema Detected',
      description: analysis.hasFaq.recommendation,
      impactScore: 3,
      confidenceScore: 80,
      effortEstimate: 'LOW',
      recommendedFix: ['Add FAQPage JSON-LD to any page with Q&A content to unlock rich results'],
    });
  }

  return {
    status: 'COMPLETE',
    data: {
      ...analysis,
      findings,
      evidenceSnapshots: [{ source: 'Schema Analysis', rawResponse: analysis }],
    },
  };
};

export const MODULE_REGISTRY: ModuleConfig[] = [
  // Phase 1: Foundation (parallel) — no dependencies
  { name: 'website', phase: 1, run: websiteAdapter, timeoutMs: 30000 },
  { name: 'websiteCrawler', phase: 1, run: websiteCrawlerAdapter, timeoutMs: 45000 },
  { name: 'gbp', phase: 1, run: gbpAdapter, timeoutMs: 20000 },
  { name: 'competitor', phase: 1, run: competitorAdapter, timeoutMs: 25000 },
  { name: 'techStack', phase: 1, run: techStackAdapter, timeoutMs: 15000 },
  { name: 'security', phase: 1, run: securityAdapter, timeoutMs: 20000 },
  { name: 'emailFinder', phase: 1, run: emailFinderAdapter, timeoutMs: 15000, optional: true },
  // P1-7: Previously dead modules — now wired as Phase 2 (depend on Phase 1 output)
  {
    name: 'coreWebVitals',
    phase: 2,
    run: coreWebVitalsAdapter,
    dependsOn: ['website'],
    timeoutMs: 10000,
  },
  {
    name: 'schemaAnalysis',
    phase: 2,
    run: schemaAnalysisAdapter,
    dependsOn: ['websiteCrawler'],
    timeoutMs: 20000,
  },

  // Phase 2: Analysis (parallel) — depends on Phase 1 data
  { name: 'reputation', phase: 2, run: reputationAdapter, dependsOn: ['gbp'], timeoutMs: 30000 },
  { name: 'social', phase: 2, run: socialAdapter, dependsOn: ['website'], timeoutMs: 30000 },
  {
    name: 'socialDeep',
    phase: 2,
    run: socialDeepAdapter,
    dependsOn: ['social'],
    optional: true,
    timeoutMs: 45000,
  },
  {
    name: 'gbpDeep',
    phase: 2,
    run: gbpDeepAdapter,
    dependsOn: ['gbp'],
    optional: true,
    timeoutMs: 45000,
  },
  {
    name: 'seoDeep',
    phase: 2,
    run: seoDeepAdapter,
    dependsOn: ['website', 'websiteCrawler'],
    timeoutMs: 60000,
  },
  {
    name: 'accessibility',
    phase: 2,
    run: accessibilityAdapter,
    dependsOn: ['website'],
    timeoutMs: 45000,
  },
  { name: 'mobileUX', phase: 2, run: mobileUXAdapter, dependsOn: ['website'], timeoutMs: 45000 },
  {
    name: 'contentQuality',
    phase: 2,
    run: contentQualityAdapter,
    dependsOn: ['websiteCrawler'],
    timeoutMs: 60000,
  },
  {
    name: 'conversion',
    phase: 2,
    run: conversionAdapter,
    dependsOn: ['website'],
    timeoutMs: 45000,
  },
  { name: 'citations', phase: 2, run: citationsAdapter, dependsOn: ['gbp'], timeoutMs: 30000 },
  { name: 'paidSearch', phase: 2, run: paidSearchAdapter, optional: true, timeoutMs: 30000 },
  { name: 'backlinks', phase: 2, run: backlinksAdapter, optional: true, timeoutMs: 30000 },
  {
    name: 'privacyCompliance',
    phase: 2,
    run: privacyComplianceAdapter,
    dependsOn: ['website'],
    timeoutMs: 30000,
  },
  {
    name: 'schemaMarkup',
    phase: 2,
    run: schemaMarkupAdapter,
    dependsOn: ['websiteCrawler', 'gbp'],
    timeoutMs: 30000,
  },
  {
    name: 'keywordGap',
    phase: 2,
    run: keywordGapAdapter,
    dependsOn: ['gbp', 'competitor'],
    timeoutMs: 45000,
  },
  {
    name: 'videoPresence',
    phase: 2,
    run: videoPresenceAdapter,
    dependsOn: ['competitor'],
    optional: true,
    timeoutMs: 30000,
  },

  // Phase 3: Synthesis (parallel) — depends on Phase 2
  {
    name: 'competitorStrategy',
    phase: 3,
    run: competitorStrategyAdapter,
    dependsOn: ['competitor', 'seoDeep'],
    timeoutMs: 60000,
  },
  {
    name: 'vision',
    phase: 3,
    run: visionAdapter,
    dependsOn: ['websiteCrawler'],
    optional: true,
    timeoutMs: 60000,
  },
];

/**
 * P2-25: modules gated by an ENABLE_*_AUDIT_MODULE feature flag. All 4 flags default
 * to enabled (see lib/config/feature-flags.ts) so existing behavior is unchanged
 * until an operator explicitly opts out. Checked inline in executePhase() below (not
 * via a second filtered copy of MODULE_REGISTRY) so disabled modules still get an
 * explicit SKIPPED/"DISABLED" result recorded — distinguishing "operator turned this
 * off" from "this module failed" or "this module is missing" for dependents and for
 * customer-facing status reporting.
 */
export const FEATURE_FLAG_GATED_MODULES: Partial<Record<string, keyof typeof FEATURE_FLAGS>> = {
  accessibility: 'ENABLE_ACCESSIBILITY_AUDIT_MODULE',
  coreWebVitals: 'ENABLE_PERFORMANCE_AUDIT_MODULE',
  seoDeep: 'ENABLE_SEO_AUDIT_MODULE',
  security: 'ENABLE_SECURITY_AUDIT_MODULE',
};

/**
 * Normalizes findings out of the custom module results and legacy modules
 */
export function extractFindingsFromRegistryResult(
  moduleName: string,
  result: ModuleResult,
  input: ModuleInput
): { findings: any[]; snapshots: any[] } {
  if (result.status !== 'COMPLETE' || !result.data) return { findings: [], snapshots: [] };
  const rd = result.data;

  const findings: any[] = [];
  const snapshots: any[] = [];

  // legacy path
  if (moduleName === 'website') {
    const rawResponse = Array.isArray(rd.findings) ? rd : rd.data || rd;
    if (Array.isArray(rd.findings)) {
      findings.push(...rd.findings.map((f: any) => ({ ...f, module: 'website' })));
    } else {
      findings.push(...generateWebsiteFindings(rawResponse));
    }
    snapshots.push({ source: 'PageSpeed', rawResponse });
  } else if (moduleName === 'gbp') {
    // P1-29 (Wave 7): an ambiguous business match (common name, franchise, or a
    // weak candidate) must never produce definitive customer-negative findings
    // about a business we could not confirm is actually the customer's listing.
    if (rd?.identityConfidence === 'ambiguous') {
      const alternates: string[] = Array.isArray(rd.alternateCandidateNames)
        ? rd.alternateCandidateNames
        : [];
      findings.push({
        module: 'gbp',
        category: 'Visibility',
        type: 'VITAMIN',
        title: 'Google Business Profile Match Needs Manual Confirmation',
        description:
          `We found a Google Business Profile that may match "${input.businessName || 'this business'}", ` +
          `but could not confirm it with confidence` +
          (alternates.length > 0
            ? ` — similarly named results include: ${alternates.join(', ')}.`
            : '.') +
          ' Specific profile findings are withheld until the correct listing is confirmed.',
        impactScore: 0,
        confidenceScore: 40,
        evidence: [
          createEvidence({
            pointer: rd.placeId
              ? `https://places.googleapis.com/v1/places/${rd.placeId}`
              : input.url || 'https://www.google.com/maps',
            source: 'places_api_v1',
            type: 'text',
            value: `matchConfidenceScore=${rd.matchConfidenceScore ?? 'unknown'}, candidatesConsidered=${rd.candidatesConsidered ?? 'unknown'}`,
            label: 'GBP Identity Match',
          }),
        ],
        metrics: {
          identityConfidence: 'ambiguous',
          candidatesConsidered: rd.candidatesConsidered ?? null,
        },
        effortEstimate: 'LOW',
        recommendedFix: [
          'Confirm which Google Business Profile listing is actually yours',
          'Provide the exact Place ID or Google Maps link to improve match accuracy',
        ],
      });
    } else {
      findings.push(
        ...generateGBPFindings(
          rd,
          input.businessName || 'Unknown',
          input.dependencyResults?.competitor
        )
      );
    }
    snapshots.push({ source: 'Places API', rawResponse: rd });
  } else if (moduleName === 'competitor') {
    findings.push(...generateCompetitorFindings(rd, input.businessName || 'Unknown'));
    snapshots.push({ source: 'SerpAPI', rawResponse: rd });
  } else if (moduleName === 'social') {
    findings.push(...generateSocialFindings(rd));
    snapshots.push({ source: 'HTML Analysis', rawResponse: rd });
  } else if (moduleName === 'reputation') {
    findings.push(...generateReputationFindings(rd));
    snapshots.push({ source: 'AI Rep Analysis', rawResponse: rd });
  } else if (moduleName === 'security' || moduleName === 'schemaMarkup') {
    if (Array.isArray(rd.findings)) {
      findings.push(...rd.findings.map((f: any) => ({ ...f, module: moduleName })));
    }
    snapshots.push({ source: 'Module Data', rawResponse: rd });
  } else if (moduleName === 'emailFinder') {
    if (rd.emails && rd.emails.length > 0) {
      // Wave 3 (P2-36): real pointer is the crawled URL the emails were extracted from.
      const collectedAt = new Date().toISOString();
      findings.push({
        module: 'emailFinder',
        category: 'Contact & Outreach',
        type: 'VITAMIN',
        title: `${rd.emails.length} Emails Found`,
        description: `Discovered emails: ${rd.emails.join(', ')}`,
        evidence: rd.emails.map((e: string) =>
          createEvidence({
            pointer: input.url as string,
            source: 'email_finder',
            collected_at: collectedAt,
            type: 'text',
            value: e,
            label: 'Email',
          })
        ),
        metrics: { emailCount: rd.emails.length },
        impactScore: 3,
        confidenceScore: 90,
        effortEstimate: 'LOW',
        recommendedFix: ['Use for outreach'],
      });
    }
  } else {
    // new modules path
    if (Array.isArray(rd.findings)) {
      // Wave 3 (Step 3 requirement 4): trusted module identity always wins over
      // whatever the module output itself claims — a module cannot mislabel its
      // findings as belonging to a different module.
      findings.push(...rd.findings.map((f: any) => ({ ...f, module: moduleName })));
      if (rd.evidenceSnapshots && Array.isArray(rd.evidenceSnapshots)) {
        rd.evidenceSnapshots.forEach((s: any) => snapshots.push(s));
      } else {
        snapshots.push({ source: moduleName, rawResponse: rd });
      }
    }
  }

  return { findings, snapshots };
}

// --- Step 3: Replace the current execution logic ---

/**
 * Per-phase concurrency limit.
 *
 * Phase 2 has the most modules (≈18) and many of them call AI providers.
 * A bounded limit prevents thundering herd on Gemini/Vertex/Lighthouse and
 * keeps tail latency predictable.  Tunable via env without code change.
 *
 * Default of 6 is conservative for free-tier quotas; production should
 * tune AUDIT_PHASE_CONCURRENCY based on observed throttling.
 */
function getPhaseConcurrency(): number {
  const raw = process.env.AUDIT_PHASE_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 6;
}

async function executePhase(
  phase: number,
  registry: ModuleConfig[],
  results: Map<string, ModuleResult>,
  input: ModuleInput,
  costTracker: CostTracker,
  parentTrace: any,
  signal?: AbortSignal
): Promise<void> {
  const phaseModules = registry.filter((m) => m.phase === phase);
  const phaseStart = Date.now();
  const concurrency = getPhaseConcurrency();

  logger.info(
    {
      event: 'audit.phase_start',
      phase,
      moduleCount: phaseModules.length,
      concurrency,
    },
    `[Audit] Phase ${phase} start (${phaseModules.length} modules, concurrency=${concurrency})`
  );

  const tasks = phaseModules.map((mod) => async () => {
    // P2-25: feature-flag-gated modules report as explicitly DISABLED, distinct from a
    // dependency-skip or a provider failure — dependents treat a disabled optional
    // dependency the same as a missing/failed one (fail-open on optionality), but the
    // audit-level reporting must not conflate "disabled by operator" with "broke".
    const gateFlag = FEATURE_FLAG_GATED_MODULES[mod.name];
    if (gateFlag && !(await isFeatureEnabledEffective(gateFlag))) {
      results.set(mod.name, {
        status: 'SKIPPED',
        data: null,
        error: `DISABLED: ${gateFlag} is set to false`,
      });
      return;
    }

    // Check dependencies
    if (mod.dependsOn) {
      const missingDeps = mod.dependsOn.filter(
        (dep) => !results.has(dep) || results.get(dep)!.status === 'FAILED'
      );
      if (missingDeps.length > 0 && !mod.optional) {
        logger.warn({ module: mod.name, missingDeps }, 'Skipping module — dependencies failed');
        results.set(mod.name, {
          status: 'SKIPPED',
          data: null,
          error: `Dependencies failed: ${missingDeps.join(', ')}`,
        });
        return;
      }
    }

    const moduleStart = Date.now();
    try {
      if (signal?.aborted) return;

      const moduleInput: ModuleInput = {
        ...input,
        signal,
        dependencyResults: Object.fromEntries(
          (mod.dependsOn || [])
            .map((dep) => [dep, results.get(dep)?.data])
            .filter(([_, v]) => v != null)
        ),
      };

      const runPromise = async (moduleSignal: AbortSignal) => {
        if (moduleSignal.aborted) {
          throw moduleSignal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        return mod.run({ ...moduleInput, signal: moduleSignal }, costTracker, parentTrace);
      };

      const result = await withTimeout(runPromise, mod.timeoutMs || 30000, signal);

      results.set(mod.name, result);

      logger.info(
        {
          event: 'audit.module_complete',
          phase,
          module: mod.name,
          status: result.status,
          durationMs: Date.now() - moduleStart,
        },
        `[Audit] Module ${mod.name} complete`
      );
    } catch (error) {
      const durationMs = Date.now() - moduleStart;
      logger.error(
        {
          event: 'audit.module_failed',
          phase,
          module: mod.name,
          durationMs,
          error: String(error),
        },
        'Module execution failed'
      );
      results.set(mod.name, { status: 'FAILED', data: null, error: String(error) });
    }
  });

  // Bounded concurrency — caps the number of in-flight provider calls
  await runWithConcurrency(tasks, { limit: concurrency });

  logger.info(
    {
      event: 'audit.phase_complete',
      phase,
      moduleCount: phaseModules.length,
      durationMs: Date.now() - phaseStart,
    },
    `[Audit] Phase ${phase} complete in ${Date.now() - phaseStart}ms`
  );
}

/**
 * Executes a named subset of MODULE_REGISTRY through the exact same canonical
 * per-module execution path (adapter dispatch, retry, timeout, result shape) used by
 * the full 27-module audit — grouped and run phase-by-phase so any dependsOn ordering
 * within the subset is respected. Used by execution profiles that intentionally run
 * fewer than all 27 canonical modules (e.g. the widget's QUICK_AUDIT profile,
 * Wave 2 / P1-21) instead of duplicating adapter-call logic outside the engine.
 *
 * Any dependency NOT included in `moduleIds` is simply absent from `results` for
 * modules in the subset, which the existing per-module dependency check already
 * handles by marking the dependent SKIPPED ("Dependencies failed") — callers should
 * pass a subset that is closed under its own dependencies to avoid that.
 */
export async function runModuleSubset(
  moduleIds: readonly string[],
  input: ModuleInput,
  costTracker: CostTracker,
  signal?: AbortSignal
): Promise<Map<string, ModuleResult>> {
  return withTenantRuntimeContext({ auditSignal: signal ?? null }, async () => {
    const results = new Map<string, ModuleResult>();
    const idSet = new Set(moduleIds);
    const selected = MODULE_REGISTRY.filter((m) => idSet.has(m.name));
    const phases = Array.from(new Set(selected.map((m) => m.phase))).sort((a, b) => a - b);

    for (const phase of phases) {
      await executePhase(phase, selected, results, input, costTracker, undefined, signal);
    }

    return results;
  });
}

// ─── P2-3 / P1-34: Finding deduplication ────────────────────────────────────
/**
 * Deduplicates findings before DB insert.
 *
 * P1-34 (Wave 5): title-only matching under-deduplicates (two modules phrasing the
 * same root-cause observation slightly differently, e.g. "Missing LocalBusiness
 * Schema" vs "Missing LocalBusiness/Organization Schema" both stay) and can
 * over-merge unrelated findings that happen to share a title. A finding may declare
 * a stable root-cause key at `metrics.schemaFingerprint` (or the more generic
 * `metrics.fingerprint`) — set by modules that know they might overlap with another
 * module's observation of the exact same underlying fact (e.g. `schemaMarkup` and
 * `schemaAnalysis` both observing "no LocalBusiness schema present"). When present,
 * that fingerprint is the dedup key instead of type+title, so near-title duplicates
 * with the same root cause correctly merge while distinct schema issues (different
 * fingerprint) never do. Findings without a fingerprint keep the original
 * type+title behavior unchanged.
 *
 * The surviving finding keeps the higher impactScore, but retains the UNION of both
 * findings' evidence (deterministically ordered: survivor's own evidence first, then
 * any evidence from the merged-away finding not already present by pointer) rather
 * than silently discarding the loser's real evidence.
 */
export function deduplicateFindings(findings: any[]): any[] {
  const seen = new Map<string, any>();
  for (const finding of findings) {
    const fingerprint = finding?.metrics?.schemaFingerprint || finding?.metrics?.fingerprint;
    const key = fingerprint
      ? `fp:${fingerprint}`
      : `${finding.type}:${(finding.title || '').toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, finding);
      continue;
    }
    const winner = (finding.impactScore ?? 0) > (existing.impactScore ?? 0) ? finding : existing;
    const loser = winner === finding ? existing : finding;
    const winnerPointers = new Set((winner.evidence || []).map((e: any) => e?.pointer));
    const mergedEvidence = [
      ...(winner.evidence || []),
      ...(loser.evidence || []).filter((e: any) => !winnerPointers.has(e?.pointer)),
    ];
    seen.set(key, { ...winner, evidence: mergedEvidence });
  }
  return Array.from(seen.values());
}

// ─── P2-1: Global audit timeout ──────────────────────────────────────────────
/**
 * Wall-clock limit for an entire audit run (all phases + DB writes).
 * P0 FIX: Reduced from 5 minutes to 30 seconds to meet performance target.
 * If audit exceeds 30s, it will be marked as FAILED and cached result will be checked.
 */
const GLOBAL_AUDIT_TIMEOUT_MS = process.env.GLOBAL_AUDIT_TIMEOUT_MS
  ? parseInt(process.env.GLOBAL_AUDIT_TIMEOUT_MS, 10)
  : 60 * 1000; // 60 seconds (adjusted to support slower local Puppeteer navigations)

// Module-level timeout - each module should complete within this time
const MODULE_TIMEOUT_MS = 10 * 1000; // 10 seconds per module

// ============================================================================
// P3: Performance Instrumentation
// ============================================================================

/**
 * Performance timing helper for audit profiling
 */
class AuditPerformanceTimer {
  private timings: Map<string, number> = new Map();
  private startTime: number = Date.now();

  mark(label: string): void {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const prevMark = this.timings.get(label);

    if (prevMark) {
      logger.info({ label, elapsed, delta: elapsed - prevMark }, `[AuditPerformance] ${label}`);
    } else {
      logger.info({ label, elapsed }, `[AuditPerformance] ${label}`);
    }

    this.timings.set(label, elapsed);
  }

  getTiming(label: string): number | undefined {
    return this.timings.get(label);
  }

  getAllTimings(): Record<string, number> {
    return Object.fromEntries(this.timings);
  }

  get totalDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Returns timing breakdown by phase
   */
  getPhaseBreakdown(): {
    totalMs: number;
    phases: Record<string, number>;
    bottlenecks: string[];
  } {
    const phases: Record<string, number> = {};
    const entries = Array.from(this.timings.entries());
    let prevTime = 0;

    for (const entry of entries) {
      const [label, time] = entry;
      phases[label] = time - prevTime;
      prevTime = time;
    }

    // Identify bottlenecks (phases taking > 20% of total time)
    const bottlenecks: string[] = [];
    const total = this.totalDuration || 1; // Avoid division by zero
    for (const [phase, duration] of Object.entries(phases)) {
      if (duration / total > 0.2) {
        bottlenecks.push(phase);
      }
    }

    return {
      totalMs: this.totalDuration,
      phases,
      bottlenecks,
    };
  }
}

const auditTimer = new AuditPerformanceTimer();

/**
 * Public entry point. Wraps the internal runner in a hard 5-minute timeout.
 * If the timeout fires, the audit row is marked FAILED and the error is rethrown.
 */
export async function runAudit(auditId: string) {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('AUDIT_TIMEOUT: Global 5-minute limit exceeded'));
    }, GLOBAL_AUDIT_TIMEOUT_MS);
  });
  return withTenantRuntimeContext({ auditSignal: controller.signal }, async () => {
    try {
      return await Promise.race([runAuditInternal(auditId, controller.signal), timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('AUDIT_TIMEOUT')) {
        // Best-effort status update — don't let this throw and mask the original error
        await prisma.audit
          .update({
            where: { id: auditId },
            data: { status: 'FAILED', completedAt: new Date() },
          })
          .catch(() => null);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  });
}

/**
 * Generate cache key from URL
 */
function generateUrlHash(url: string | null | undefined): string | null {
  if (!url) return null;
  return createHash('sha256').update(url).digest('hex');
}

/** Internal implementation — called only by runAudit() above. */
async function runAuditInternal(auditId: string, signal?: AbortSignal) {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
  });

  if (!audit) {
    throw new Error(`Audit ${auditId} not found`);
  }

  // P0 FIX: Check cache first for same URL audit within 24h
  const urlHash = generateUrlHash(audit.businessUrl);
  if (urlHash) {
    try {
      const cachedAudit = await redisCache.get<any>('audit', urlHash);
      if (cachedAudit && cachedAudit.status === 'COMPLETE') {
        logger.info(
          { auditId, urlHash },
          '[runAudit] Returning cached audit result (same URL within 24h)'
        );
        return {
          success: true,
          auditId: audit.id,
          status: 'COMPLETE',
          cached: true,
          ...cachedAudit,
        };
      }
    } catch (error) {
      logger.warn({ error }, '[runAudit] Cache check failed, proceeding with fresh audit');
    }
  }

  return withChildObservabilityContext(
    {
      auditId: audit.id,
      tenantId: audit.tenantId,
      workflow: 'audit-runner',
    },
    async () => {
      const { businessName: name, businessCity: city, businessUrl: url } = audit;
      const startTime = Date.now();

      // Update status to RUNNING
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      Metrics.increment('audits_total');
      MetricsRecorder.auditRun(audit.tenantId);

      logger.info(
        {
          event: 'audit.start',
          auditId: audit.id,
          tenantId: audit.tenantId,
          hasBusinessName: Boolean(name),
          hasTargetUrl: Boolean(url),
        },
        'Starting audit execution'
      );
      await recordAuditTrailEvent({
        eventType: 'audit.started',
        tenantId: audit.tenantId,
        auditId: audit.id,
        targetUrl: audit.businessUrl,
        triggerSource: 'audit-runner',
        payload: {
          status: 'RUNNING',
        },
      });

      const costTracker = new CostTracker();

      // Reserve budget for this audit (atomic, cross-instance safe).
      // settled in the finally block below regardless of success/failure.
      let reservedCents = 0;
      try {
        const { reserveAuditBudget } = await import('@/lib/costs/costTracker');
        const reservation = await reserveAuditBudget(
          audit.tenantId,
          (audit as any).tenant?.planTier || 'STARTER'
        );
        if (!reservation.allowed) {
          logger.warn(
            { auditId: audit.id, tenantId: audit.tenantId },
            '[runAudit] Monthly budget exceeded — audit blocked'
          );
          // P-baseline: `Audit` has no `error` scalar column — module failures are
          // recorded in the `modulesFailed: Json` array (see all other writers/readers
          // of this field, e.g. the per-module FAILED branch below and
          // app/api/analytics/route.ts's reader). Merge into any failures already
          // recorded on this row rather than overwriting them, matching the
          // established read-modify-write pattern used elsewhere for this field.
          const existingModulesFailed = Array.isArray(
            (audit as { modulesFailed?: unknown }).modulesFailed
          )
            ? ((audit as { modulesFailed?: unknown }).modulesFailed as Array<{
                module: string;
                error: string;
              }>)
            : [];
          await prisma.audit.update({
            where: { id: audit.id },
            data: {
              status: 'FAILED',
              modulesFailed: [
                ...existingModulesFailed,
                { module: 'budget', error: 'BUDGET_EXCEEDED' },
              ],
              completedAt: new Date(),
            },
          });
          return { success: false, auditId: audit.id, status: 'FAILED', error: 'BUDGET_EXCEEDED' };
        }
        reservedCents = reservation.reservedCents;
      } catch (budgetErr) {
        // Budget check failure is non-fatal — proceed with audit (conservative)
        logger.warn({ error: budgetErr }, '[runAudit] Budget reservation failed — proceeding');
      }

      try {
        let parentTrace: RunTree | undefined;
        try {
          parentTrace = await createParentTrace(audit.id, 'audit-data-collection', {
            tenantId: audit.tenantId,
            hasBusinessName: Boolean(name),
            hasUrl: Boolean(url),
          });
        } catch (e) {
          logger.error({ error: e }, 'Failed to create parent trace');
        }

        const moduleInput: ModuleInput = {
          auditId: audit.id,
          url: url || undefined,
          businessName: name || undefined,
          city: city || undefined,
          industry: audit.businessIndustry || undefined,
          tenantId: audit.tenantId,
        };

        const results = new Map<string, ModuleResult>();

        // Phase 1: Foundation
        await executePhase(
          1,
          MODULE_REGISTRY,
          results,
          moduleInput,
          costTracker,
          parentTrace,
          signal
        );
        if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

        // Phase 2: Analysis (uses Phase 1 outputs)
        await executePhase(
          2,
          MODULE_REGISTRY,
          results,
          moduleInput,
          costTracker,
          parentTrace,
          signal
        );
        if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

        // Phase 3: Synthesis (uses Phase 1 + 2 outputs)
        await executePhase(
          3,
          MODULE_REGISTRY,
          results,
          moduleInput,
          costTracker,
          parentTrace,
          signal
        );
        if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

        const allFindings: any[] = [];
        const modulesCompleted: string[] = [];
        const modulesFailed: any[] = [];
        const rejectedFindings: RejectedFinding[] = [];
        let failedEvidenceWrites = 0;

        // Synthesize results into discoveries and evidence
        for (const [modName, res] of Array.from(results.entries())) {
          if (res.status === 'COMPLETE' || res.status === 'PARTIAL') {
            if (res.status === 'COMPLETE') modulesCompleted.push(modName);
            const ext = extractFindingsFromRegistryResult(modName, res, moduleInput);

            // Wave 3 (Step 5): the one shared adapter/aggregation boundary every
            // module's raw finding output must pass through before it can become a
            // customer-facing Finding. Rejects malformed/evidence-less findings
            // outright rather than repairing them with fabricated evidence.
            const { accepted, rejected } = normalizeAndValidateModuleFindings(
              modName,
              res.status,
              ext.findings
            );
            allFindings.push(...accepted);
            rejectedFindings.push(...rejected);

            for (const snap of ext.snapshots) {
              try {
                await prisma.evidenceSnapshot.create({
                  data: {
                    auditId: audit.id,
                    module: modName,
                    source: snap.source || modName,
                    rawResponse: snap.rawResponse ?? snap,
                    tenantId: audit.tenantId,
                  },
                });
              } catch (error) {
                failedEvidenceWrites += 1;
                Metrics.increment('failed_evidence_writes' as any);
                logger.warn(
                  {
                    event: 'audit.evidence_snapshot_write_failed',
                    auditId: audit.id,
                    module: modName,
                    source: snap.source || modName,
                    error: String(error),
                  },
                  'Failed to persist evidence snapshot (non-fatal)'
                );
              }
            }
          } else if (res.status === 'FAILED') {
            modulesFailed.push({ module: modName, error: res.error });
          }
        }

        if (rejectedFindings.length > 0) {
          logger.warn(
            {
              event: 'audit.findings_rejected_at_aggregation',
              auditId: audit.id,
              tenantId: audit.tenantId,
              rejectedCount: rejectedFindings.length,
              rejected: rejectedFindings,
            },
            `[Audit] Rejected ${rejectedFindings.length} malformed/evidence-less finding(s) before aggregation`
          );
        }

        // NOTE (Wave 3, Step 8 — was: "GBP missing fallback (Preserves original
        // behavior)"): removed. The prior fallback fabricated a customer-negative "No
        // Google Business Listing Detected" Finding whenever the gbp module simply
        // wasn't in `modulesCompleted` — collapsing "search ran, genuinely zero
        // results", a provider outage, a quota error, and a missing API key into the
        // same fabricated finding (AUDIT_REPORT.md Pass 4B). Provider/module failure
        // must never become verified absence (Step 8). A trustworthy "no GBP listing"
        // finding requires the gbp module itself to distinguish a genuine zero-result
        // search from a failure and return real evidence identifying the search that
        // was run — that is gbp.ts module work, assigned to a later module wave
        // (root-cause group E/H), not a Wave 3 boundary-enforcement fix. Until then: no
        // finding is fabricated here.

        // P2-3: Deduplicate findings before persisting
        const dedupedFindings = deduplicateFindings(allFindings);

        // Create Finding records in DB (Wave 3, Step 6: routed through the one
        // validated persistence boundary — no direct prisma.finding.createMany here).
        if (dedupedFindings.length > 0) {
          const persistResult = await persistFindings(audit.id, audit.tenantId, dedupedFindings);
          if (persistResult.rejected.length > 0) {
            logger.warn(
              {
                event: 'audit.findings_rejected_at_persistence',
                auditId: audit.id,
                tenantId: audit.tenantId,
                rejectedCount: persistResult.rejected.length,
              },
              `[Audit] Persistence layer rejected ${persistResult.rejected.length} finding(s) that passed aggregation but failed final revalidation`
            );
          }
        }

        // Calculate total API cost
        const totalCostCents = costTracker.getTotalCents();

        // Determine final status
        const totalModules = MODULE_REGISTRY.filter((m) => !m.optional).length;
        const completedRequiredModules = [...results.entries()].filter(([n, r]) => {
          const specs = MODULE_REGISTRY.find((x) => x.name === n);
          return specs && !specs.optional && r.status === 'COMPLETE';
        }).length;

        let finalStatus =
          completedRequiredModules >= totalModules * 0.8
            ? 'COMPLETE'
            : completedRequiredModules >= totalModules * 0.5
              ? 'PARTIAL'
              : completedRequiredModules >= 1
                ? 'DEGRADED'
                : 'FAILED';

        const failedCriticalModules = CRITICAL_COMPLETION_MODULES.filter((moduleName: string) => {
          const moduleResult = results.get(moduleName);
          return !moduleResult || moduleResult.status !== 'COMPLETE';
        });

        // Guardrail: never emit COMPLETE if any critical module failed/skipped.
        if (finalStatus === 'COMPLETE' && failedCriticalModules.length > 0) {
          finalStatus = 'PARTIAL';
          logger.warn(
            {
              event: 'audit.final_status_downgraded_for_critical_failures',
              auditId: audit.id,
              failedCriticalModules,
            },
            'Downgrading audit status from COMPLETE because critical modules were not completed'
          );
        }

        const detectIndustryFromCategory = (type: string): string => {
          const t = type.toLowerCase();
          if (t.includes('law') || t.includes('attorney') || t.includes('legal')) return 'legal';
          if (t.includes('dent') || t.includes('ortho')) return 'dental';
          if (t.includes('med') || t.includes('health') || t.includes('clinic')) return 'medical';
          if (t.includes('construct') || t.includes('build')) return 'construction';
          if (t.includes('plumb')) return 'plumbing';
          if (t.includes('hvac') || t.includes('air')) return 'hvac';
          if (t.includes('real') || t.includes('estate') || t.includes('realtor'))
            return 'real_estate';
          if (t.includes('roof')) return 'roofing';
          return 'general';
        };

        let detectedIndustry: string | null = null;
        const gbpData = results.get('gbp')?.data;
        const gbpTypes = gbpData?.types || [];
        if (gbpTypes.length > 0) {
          for (const type of gbpTypes) {
            const industry = detectIndustryFromCategory(type);
            if (industry !== 'general') {
              detectedIndustry = industry;
              break;
            }
          }
        }

        const verticalPlaybookId = detectVertical({
          businessName: name,
          businessIndustry: detectedIndustry,
          businessCity: city,
          businessUrl: url,
          gbpCategories: gbpTypes,
          reviewCount: gbpData?.reviewCount,
          rating: gbpData?.rating,
        });

        await prisma.audit.update({
          where: { id: audit.id },
          data: {
            status: finalStatus as any,
            modulesCompleted,
            modulesFailed,
            apiCostCents: totalCostCents,
            completedAt: new Date(),
            businessIndustry: detectedIndustry ?? undefined,
            verticalPlaybookId: verticalPlaybookId !== 'general' ? verticalPlaybookId : undefined,
          },
        });

        const duration_ms = Date.now() - startTime;
        MetricsRecorder.auditCompleted(
          audit.tenantId,
          finalStatus,
          duration_ms,
          totalCostCents / 100
        );
        if (finalStatus === 'FAILED') {
          MetricsRecorder.auditFailure(audit.tenantId, 'audit_failed');
        }
        await recordAuditTrailEvent({
          eventType: finalStatus === 'FAILED' ? 'audit.failed' : 'audit.completed',
          tenantId: audit.tenantId,
          auditId: audit.id,
          targetUrl: audit.businessUrl,
          modulesRun: modulesCompleted,
          findingsCount: dedupedFindings.length,
          proposalGenerated: false,
          payload: {
            status: finalStatus,
            durationMs: duration_ms,
            apiCostCents: totalCostCents,
            modulesFailed,
          },
        });

        logger.info(
          {
            event: 'audit.complete',
            auditId: audit.id,
            status: finalStatus,
            findingsCount: allFindings.length,
            modulesCompleted: modulesCompleted.length,
            modulesFailed: modulesFailed.length,
            failedEvidenceWrites,
            failedCriticalModules,
            duration_ms,
            apiCostCents: totalCostCents,
          },
          'Audit complete'
        );

        const result = {
          success: true,
          auditId: audit.id,
          status: finalStatus,
          modulesCompleted,
          modulesFailed,
          findingsCount: allFindings.length,
          costCents: totalCostCents,
          duration_ms,
        };

        // P0 FIX: Cache successful audit results for 24h
        if (urlHash && finalStatus === 'COMPLETE') {
          try {
            await redisCache.set(
              'audit',
              urlHash,
              {
                status: finalStatus,
                modulesCompleted,
                findingsCount: allFindings.length,
                costCents: totalCostCents,
                duration_ms,
                completedAt: new Date().toISOString(),
              },
              { ttl: 24 * 60 * 60 } // 24 hours
            );
            logger.info({ auditId, urlHash }, '[runAudit] Cached audit result');
          } catch (error) {
            logger.warn({ error }, '[runAudit] Failed to cache audit result');
          }
        }

        return result;
      } finally {
        // Settle budget reservation — release unused portion (runs even on crash/throw)
        if (reservedCents > 0) {
          try {
            const { settleAuditSpend } = await import('@/lib/costs/costTracker');
            await settleAuditSpend(
              audit.tenantId,
              reservedCents,
              costTracker.getTotalCents(),
              (audit as any).tenant?.planTier || 'STARTER'
            );
          } catch (settleErr) {
            // Non-critical: reservation stays (conservative, self-heals at month boundary via TTL)
            logger.warn(
              { error: settleErr, auditId: audit.id },
              '[runAudit] Failed to settle reservation'
            );
          }
        }
      }
    }
  );
}
