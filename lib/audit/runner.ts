import { Metrics } from '@/lib/metrics';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { withChildObservabilityContext } from '@/lib/observability/context';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';
import {
  generateCompetitorFindings,
  generateGBPFindings,
  generateReputationFindings,
  generateSocialFindings,
  generateWebsiteFindings,
} from '@/lib/modules/findingGenerator';
import { detectVertical } from '@/lib/playbooks';
import { prisma } from '@/lib/prisma';
import { createParentTrace } from '@/lib/tracing';

// --- Step 1: Import all modules ---
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Adapters to normalize the diverse module inputs/outputs into the standard ModuleResult
const websiteAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runWebsiteModule({ url: input.url }, tracker);
  return { status: 'COMPLETE', data };
};

const websiteCrawlerAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  if (!input.url || !input.businessName) throw new Error('url and businessName required');
  const data = await runWebsiteCrawlerModule({ url: input.url, businessName: input.businessName });
  return { status: 'COMPLETE', data };
};

const gbpAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('businessName and city required');
  const data = await runGbpModule(
    { businessName: input.businessName, city: input.city, websiteUrl: input.url },
    tracker
  );
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const competitorAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('keyword and location required');
  const data = await runCompetitorModule(
    { keyword: input.businessName, location: input.city },
    tracker
  );
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const techStackAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runTechStackModule({ url: input.url }, tracker);
  return { status: 'COMPLETE', data };
};

const securityAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runSecurityModule({ url: input.url });
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const emailFinderAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runEmailFinderModule(input.url);
  if ((data as unknown as Record<string, any>).status === 'error')
    throw new Error((data as unknown as Record<string, any>).error);
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
    },
    tracker
  );
  return { status: 'COMPLETE', data };
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
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const seoDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runSeoDeepModule(
    { url: input.url, businessName: input.businessName || 'Unknown', city: input.city },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const accessibilityAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runAccessibilityModule({ url: input.url }, tracker);
  return { status: 'COMPLETE', data };
};

const mobileUXAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runMobileUXModule(
    { url: input.url, businessName: input.businessName || 'Unknown' },
    tracker
  );
  return { status: 'COMPLETE', data };
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
    { url: input.url, businessName: input.businessName || 'Unknown', industry: input.industry },
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
  return { status: 'COMPLETE', data };
};

const backlinksAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const data = await runBacklinksModule(
    { websiteUrl: input.url, businessName: input.businessName, city: input.city },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const privacyComplianceAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const data = await runPrivacyComplianceModule(
    { url: input.url, businessName: input.businessName || 'Unknown', city: input.city || '' },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const schemaMarkupAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
  if (!input.url) throw new Error('url required');
  const gbpData = input.dependencyResults?.gbp;
  const data = await runSchemaMarkupModule({
    url: input.url,
    businessName: input.businessName,
    gbpTypes: gbpData?.types,
  });
  return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
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

const videoPresenceAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.businessName || !input.city) throw new Error('name, city required');
  const compData = input.dependencyResults?.competitor;
  const competitors = compData?.results?.slice(0, 3).map((r: any) => r.title) || [];
  const data = await runVideoPresenceModule(
    {
      businessName: input.businessName,
      city: input.city,
      industry: input.industry || 'Generic',
      websiteUrl: input.url || '',
      competitors,
    },
    tracker
  );
  return { status: 'COMPLETE', data };
};

const competitorStrategyAdapter = async (
  input: ModuleInput,
  tracker: CostTracker
): Promise<ModuleResult> => {
  if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
  const compData = input.dependencyResults?.competitor;
  const topComp = compData?.results?.find(
    (r: any) => r.link && r.title && r.title !== input.businessName
  );
  if (!topComp) return { status: 'SKIPPED', data: null, error: 'No major competitor found' };
  const data = await runCompetitorStrategyModule(
    {
      businessName: input.businessName,
      industry: input.industry || 'Generic',
      city: input.city,
      websiteUrl: input.url,
      competitorName: topComp.title,
      competitorWebsite: topComp.link,
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
      type: cwv.lcp.rating === 'poor' ? 'CRITICAL' : 'WARNING',
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
      type: cwv.cls.rating === 'poor' ? 'CRITICAL' : 'WARNING',
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
      type: cwv.tbt.rating === 'poor' ? 'CRITICAL' : 'WARNING',
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
  if (!analysis.hasLocalBusinessOrOrganization.present) {
    findings.push({
      module: 'schemaAnalysis',
      category: 'SEO',
      type: 'CRITICAL',
      title: 'Missing LocalBusiness/Organization Schema',
      description: analysis.hasLocalBusinessOrOrganization.recommendation,
      impactScore: 8,
      confidenceScore: 95,
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
      type: 'WARNING',
      title: 'Missing AggregateRating Schema',
      description: analysis.hasReviewAggregateRating.recommendation,
      impactScore: 5,
      confidenceScore: 90,
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
      type: 'OPPORTUNITY',
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
 * Normalizes findings out of the custom module results and legacy modules
 */
function extractFindingsFromRegistryResult(
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
    findings.push(
      ...generateGBPFindings(
        rd,
        input.businessName || 'Unknown',
        input.dependencyResults?.competitor
      )
    );
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
      findings.push({
        module: 'emailFinder',
        category: 'Contact & Outreach',
        type: 'POSITIVE',
        title: `${rd.emails.length} Emails Found`,
        description: `Discovered emails: ${rd.emails.join(', ')}`,
        evidence: rd.emails.map((e: string) => ({ type: 'text', value: e, label: 'Email' })),
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
      findings.push(...rd.findings.map((f: any) => ({ ...f, module: f.module || moduleName })));
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

  const executions = phaseModules.map(async (mod) => {
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

    try {
      if (signal?.aborted) return;

      const moduleInput: ModuleInput = {
        ...input,
        dependencyResults: Object.fromEntries(
          (mod.dependsOn || [])
            .map((dep) => [dep, results.get(dep)?.data])
            .filter(([_, v]) => v != null)
        ),
      };

      const runPromise = async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (signal?.aborted) throw new Error('AbortError');
            return await mod.run(moduleInput, costTracker, parentTrace);
          } catch (e) {
            if (attempt === 1 || (e as any).name === 'AbortError') throw e;
          }
        }
        throw new Error('Retries exceeded');
      };

      const result = await withTimeout(runPromise(), mod.timeoutMs || 30000);

      results.set(mod.name, result);
    } catch (error) {
      logger.error({ module: mod.name, error }, 'Module execution failed');
      results.set(mod.name, { status: 'FAILED', data: null, error: String(error) });
    }
  });

  await Promise.allSettled(executions);
}

// ─── P2-3: Finding deduplication ────────────────────────────────────────────
// Deduplicates by type + normalised title before DB insert.
// If two modules produce the same finding, we keep the one with the higher impactScore.
export function deduplicateFindings(findings: any[]): any[] {
  const seen = new Map<string, any>();
  for (const finding of findings) {
    const key = `${finding.type}:${(finding.title || '').toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing || (finding.impactScore ?? 0) > (existing.impactScore ?? 0)) {
      seen.set(key, finding);
    }
  }
  return Array.from(seen.values());
}

// ─── P2-1: Global audit timeout ──────────────────────────────────────────────
/** 
 * Wall-clock limit for an entire audit run (all phases + DB writes).
 * P0 FIX: Reduced from 5 minutes to 30 seconds to meet performance target.
 * If audit exceeds 30s, it will be marked as FAILED and cached result will be checked.
 */
const GLOBAL_AUDIT_TIMEOUT_MS = 30 * 1000; // 30 seconds (P0 target)

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
      logger.info(
        { label, elapsed, delta: elapsed - prevMark },
        `[AuditPerformance] ${label}`
      );
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
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      controller.abort();
      reject(new Error('AUDIT_TIMEOUT: Global 5-minute limit exceeded'));
    }, GLOBAL_AUDIT_TIMEOUT_MS)
  );
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
  }
}

/**
 * Generate cache key from URL
 */
function generateUrlHash(url: string | null | undefined): string | null {
  if (!url) return null;
  return crypto.createHash('sha256').update(url).digest('hex');
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
      await executePhase(1, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace, signal);

      // Phase 2: Analysis (uses Phase 1 outputs)
      await executePhase(2, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace, signal);

      // Phase 3: Synthesis (uses Phase 1 + 2 outputs)
      await executePhase(3, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace, signal);

      const allFindings: any[] = [];
      const modulesCompleted: string[] = [];
      const modulesFailed: any[] = [];
      let failedEvidenceWrites = 0;

      // Synthesize results into discoveries and evidence
      for (const [modName, res] of Array.from(results.entries())) {
    if (res.status === 'COMPLETE') {
      modulesCompleted.push(modName);
      const ext = extractFindingsFromRegistryResult(modName, res, moduleInput);
      allFindings.push(...ext.findings);

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

      // GBP missing fallback (Preserves original behavior)
      if (!modulesCompleted.includes('gbp') && name && city) {
    allFindings.push({
      module: 'gbp',
      category: 'Local SEO',
      type: 'PAINKILLER',
      title: 'No Google Business Listing Detected',
      description:
        'No Google Business listing was found for this business. This is a major missed opportunity.',
      evidence: [{ type: 'text', value: 'Places API returned no results', label: 'Search' }],
      metrics: { businessName: name, city },
      impactScore: 9,
      confidenceScore: 90,
      effortEstimate: 'MEDIUM',
      recommendedFix: ['Create a Google Business Profile'],
    });
      }

      // P2-3: Deduplicate findings before persisting
      const dedupedFindings = deduplicateFindings(allFindings);

      // Create Finding records in DB
      if (dedupedFindings.length > 0) {
    await prisma.finding.createMany({
      data: dedupedFindings.map((f) => ({
        ...f,
        auditId: audit.id,
        tenantId: audit.tenantId,
        manuallyEdited: false,
        excluded: false,
      })),
    });
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

      const failedCriticalModules = CANONICAL_MODULES.filter((moduleName) => {
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
    if (t.includes('real') || t.includes('estate') || t.includes('realtor')) return 'real_estate';
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
    }
  );
}
