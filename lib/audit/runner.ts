import { prisma } from '@/lib/prisma';
import { CANONICAL_MODULES } from '@/lib/audit/modules';
import { detectVertical } from '@/lib/playbooks';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';

// --- Step 1: Import all modules ---
import { runWebsiteModule } from '../modules/website';
import { runGBPModule as runGbpModule } from '../modules/gbp';
import { runCompetitorModule } from '../modules/competitor';
import { runReputationModule } from '../modules/reputation';
import { runSocialModule } from '../modules/social';
import { runAccessibilityModule } from '../modules/accessibility';
import { runBacklinksModule } from '../modules/backlinks';
import { runCitationsModule } from '../modules/citations';
import { runContentQualityModule } from '../modules/contentQuality';
import { runConversionModule } from '../modules/conversion';
import { findEmails as runEmailFinderModule } from '../modules/emailFinder';
import { runGbpDeepModule } from '../modules/gbpDeep';
import { runKeywordGapModule } from '../modules/keywordGap';
import { runMobileUXModule } from '../modules/mobileUX';
import { runPaidSearchModule } from '../modules/paidSearch';
import { runPrivacyModule as runPrivacyComplianceModule } from '../modules/privacyCompliance';
import { runSchemaMarkupModule } from '../modules/schemaMarkup';
import { runSecurityModule } from '../modules/security';
import { runSeoDeepModule } from '../modules/seoDeep';
import { runSocialDeepModule } from '../modules/socialDeep';
import { runTechStackModule } from '../modules/techStack';
import { runVideoModule as runVideoPresenceModule } from '../modules/videoPresence';
import { runVisionModule } from '../modules/vision';
import { runWebsiteCrawlerModule } from '../modules/websiteCrawlerModule';
import { runCompetitorStrategyModule } from '../modules/competitorStrategy';

// finding generators for legacy modules
import {
    generateWebsiteFindings,
    generateGBPFindings,
    generateCompetitorFindings,
    generateReputationFindings,
    generateSocialFindings,
} from '@/lib/modules/findingGenerator';

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
    const data = await runGbpModule({ businessName: input.businessName, city: input.city, websiteUrl: input.url }, tracker);
    return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const competitorAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.businessName || !input.city) throw new Error('keyword and location required');
    const data = await runCompetitorModule({ keyword: input.businessName, location: input.city }, tracker);
    return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const techStackAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
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
    if ((data as unknown as Record<string, any>).status === 'error') throw new Error((data as unknown as Record<string, any>).error);
    return { status: 'COMPLETE', data };
};

const reputationAdapter = async (input: ModuleInput, tracker: CostTracker, trace: any): Promise<ModuleResult> => {
    const gbpData = input.dependencyResults?.gbp;
    if (!gbpData?.reviews || gbpData.reviews.length === 0) return { status: 'SKIPPED', data: null, error: 'No reviews found' };
    const data = await runReputationModule({ reviews: gbpData.reviews, businessName: input.businessName || 'Unknown' }, tracker, trace);
    return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const socialAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName) throw new Error('url and businessName required');
    const data = await runSocialModule({ websiteUrl: input.url, businessName: input.businessName }, tracker);
    return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const socialDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName || !input.city) throw new Error('Missing input');
    const socialData = input.dependencyResults?.social;
    const discoveredUrls = socialData?.discoveredUrls || [];
    const data = await runSocialDeepModule({ websiteUrl: input.url, businessName: input.businessName, city: input.city, industry: input.industry || 'Generic', discoveredUrls }, tracker);
    return { status: 'COMPLETE', data };
};

const gbpDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    const gbpData = input.dependencyResults?.gbp;
    if (!gbpData?.placeId && !input.url) return { status: 'SKIPPED', data: null, error: 'No placeId or URL' };
    const data = await runGbpDeepModule({ placeId: gbpData?.placeId, websiteUrl: input.url, businessName: input.businessName || 'Unknown', city: input.city || 'Unknown' }, tracker);
    return { status: 'COMPLETE', data };
};

const seoDeepAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const data = await runSeoDeepModule({ url: input.url, businessName: input.businessName || 'Unknown', city: input.city }, tracker);
    return { status: 'COMPLETE', data };
};

const accessibilityAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const data = await runAccessibilityModule({ url: input.url }, tracker);
    return { status: 'COMPLETE', data };
};

const mobileUXAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const data = await runMobileUXModule({ url: input.url, businessName: input.businessName || 'Unknown' }, tracker);
    return { status: 'COMPLETE', data };
};

const contentQualityAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const crawlerData = input.dependencyResults?.websiteCrawler;
    const crawledPages = crawlerData?.evidenceSnapshots?.[0]?.rawResponse?.crawledPages || [];
    const data = await runContentQualityModule({ url: input.url, businessName: input.businessName || 'Unknown', industry: input.industry || 'Generic', city: input.city || '', crawledPages }, tracker);
    return { status: 'COMPLETE', data };
};

const conversionAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const data = await runConversionModule({ url: input.url, businessName: input.businessName || 'Unknown', industry: input.industry }, tracker);
    return { status: 'COMPLETE', data };
};

const citationsAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.businessName || !input.city) throw new Error('businessName and city required');
    const data = await runCitationsModule({ businessName: input.businessName, city: input.city }, tracker);
    return { status: 'COMPLETE', data };
};

const paidSearchAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
    const data = await runPaidSearchModule({ url: input.url, businessName: input.businessName, businessType: input.industry || 'Generic', city: input.city }, tracker);
    return { status: 'COMPLETE', data };
};

const backlinksAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
    const data = await runBacklinksModule({ websiteUrl: input.url, businessName: input.businessName, city: input.city }, tracker);
    return { status: 'COMPLETE', data };
};

const privacyComplianceAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const data = await runPrivacyComplianceModule({ url: input.url, businessName: input.businessName || 'Unknown', city: input.city || '' }, tracker);
    return { status: 'COMPLETE', data };
};

const schemaMarkupAdapter = async (input: ModuleInput): Promise<ModuleResult> => {
    if (!input.url) throw new Error('url required');
    const gbpData = input.dependencyResults?.gbp;
    const data = await runSchemaMarkupModule({ url: input.url, businessName: input.businessName, gbpTypes: gbpData?.types });
    return { status: 'COMPLETE', data: (data as unknown as Record<string, any>)?.data || data };
};

const keywordGapAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
    const data = await runKeywordGapModule({ websiteUrl: input.url, businessName: input.businessName, city: input.city, industry: input.industry || 'Generic' }, tracker);
    return { status: 'COMPLETE', data };
};

const videoPresenceAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.businessName || !input.city) throw new Error('name, city required');
    const compData = input.dependencyResults?.competitor;
    const competitors = compData?.results?.slice(0, 3).map((r: any) => r.title) || [];
    const data = await runVideoPresenceModule({ businessName: input.businessName, city: input.city, industry: input.industry || 'Generic', websiteUrl: input.url || '', competitors }, tracker);
    return { status: 'COMPLETE', data };
};

const competitorStrategyAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    if (!input.url || !input.businessName || !input.city) throw new Error('url, name, city required');
    const compData = input.dependencyResults?.competitor;
    const topComp = compData?.results?.find((r: any) => r.link && r.title && r.title !== input.businessName);
    if (!topComp) return { status: 'SKIPPED', data: null, error: 'No major competitor found' };
    const data = await runCompetitorStrategyModule({ businessName: input.businessName, industry: input.industry || 'Generic', city: input.city, websiteUrl: input.url, competitorName: topComp.title, competitorWebsite: topComp.link, competitorPlaceId: topComp.placeId }, tracker);
    return { status: 'COMPLETE', data };
};

const visionAdapter = async (input: ModuleInput, tracker: CostTracker): Promise<ModuleResult> => {
    const crawlerData = input.dependencyResults?.websiteCrawler;
    const screenshots = crawlerData?.evidenceSnapshots?.filter((s: any) => s.type === 'screenshot') || [];
    if (screenshots.length === 0) return { status: 'SKIPPED', data: null, error: 'No screenshots captured' };
    const data = await runVisionModule({ auditId: input.auditId, businessName: input.businessName || 'Unknown', industry: input.industry || 'Generic', screenshots }, tracker);
    return { status: 'COMPLETE', data };
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

    // Phase 2: Analysis (parallel) — depends on Phase 1 data
    { name: 'reputation', phase: 2, run: reputationAdapter, dependsOn: ['gbp'] },
    { name: 'social', phase: 2, run: socialAdapter, dependsOn: ['website'] },
    { name: 'socialDeep', phase: 2, run: socialDeepAdapter, dependsOn: ['social'], optional: true },
    { name: 'gbpDeep', phase: 2, run: gbpDeepAdapter, dependsOn: ['gbp'], optional: true },
    { name: 'seoDeep', phase: 2, run: seoDeepAdapter, dependsOn: ['website', 'websiteCrawler'] },
    { name: 'accessibility', phase: 2, run: accessibilityAdapter, dependsOn: ['website'] },
    { name: 'mobileUX', phase: 2, run: mobileUXAdapter, dependsOn: ['website'] },
    { name: 'contentQuality', phase: 2, run: contentQualityAdapter, dependsOn: ['websiteCrawler'] },
    { name: 'conversion', phase: 2, run: conversionAdapter, dependsOn: ['website'] },
    { name: 'citations', phase: 2, run: citationsAdapter, dependsOn: ['gbp'] },
    { name: 'paidSearch', phase: 2, run: paidSearchAdapter, optional: true },
    { name: 'backlinks', phase: 2, run: backlinksAdapter, optional: true },
    { name: 'privacyCompliance', phase: 2, run: privacyComplianceAdapter, dependsOn: ['website'] },
    { name: 'schemaMarkup', phase: 2, run: schemaMarkupAdapter, dependsOn: ['websiteCrawler', 'gbp'] },
    { name: 'keywordGap', phase: 2, run: keywordGapAdapter, dependsOn: ['gbp', 'competitor'] },
    { name: 'videoPresence', phase: 2, run: videoPresenceAdapter, dependsOn: ['competitor'], optional: true },

    // Phase 3: Synthesis (parallel) — depends on Phase 2
    { name: 'competitorStrategy', phase: 3, run: competitorStrategyAdapter, dependsOn: ['competitor', 'seoDeep'] },
    { name: 'vision', phase: 3, run: visionAdapter, dependsOn: ['websiteCrawler'], optional: true },
];

/**
 * Normalizes findings out of the custom module results and legacy modules
 */
function extractFindingsFromRegistryResult(moduleName: string, result: ModuleResult, input: ModuleInput): { findings: any[], snapshots: any[] } {
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
        findings.push(...generateGBPFindings(rd, input.businessName || 'Unknown', input.dependencyResults?.competitor));
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
    parentTrace: any
): Promise<void> {
    const phaseModules = registry.filter(m => m.phase === phase);

    const executions = phaseModules.map(async (mod) => {
        // Check dependencies
        if (mod.dependsOn) {
            const missingDeps = mod.dependsOn.filter(
                dep => !results.has(dep) || results.get(dep)!.status === 'FAILED'
            );
            if (missingDeps.length > 0 && !mod.optional) {
                logger.warn({ module: mod.name, missingDeps }, 'Skipping module — dependencies failed');
                results.set(mod.name, {
                    status: 'SKIPPED',
                    data: null,
                    error: `Dependencies failed: ${missingDeps.join(', ')}`
                });
                return;
            }
        }

        try {
            const moduleInput: ModuleInput = {
                ...input,
                dependencyResults: Object.fromEntries(
                    (mod.dependsOn || [])
                        .map(dep => [dep, results.get(dep)?.data])
                        .filter(([_, v]) => v != null)
                )
            };

            const runPromise = async () => {
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        return await mod.run(moduleInput, costTracker, parentTrace);
                    } catch (e) {
                        if (attempt === 1) throw e;
                    }
                }
                throw new Error('Retries exceeded');
            };

            const result = await withTimeout(
                runPromise(),
                mod.timeoutMs || 30000
            );

            results.set(mod.name, result);
        } catch (error) {
            logger.error({ module: mod.name, error }, 'Module execution failed');
            results.set(mod.name, { status: 'FAILED', data: null, error: String(error) });
        }
    });

    await Promise.allSettled(executions);
}

export async function runAudit(auditId: string) {
    const audit = await prisma.audit.findUnique({
        where: { id: auditId },
    });

    if (!audit) {
        throw new Error(`Audit ${auditId} not found`);
    }

    const { businessName: name, businessCity: city, businessUrl: url } = audit;
    const startTime = Date.now();

    // Update status to RUNNING
    await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'RUNNING', startedAt: new Date() },
    });

    Metrics.increment('audits_total');

    logger.info({
        event: 'audit.start',
        auditId: audit.id,
        businessName: name,
        city,
        url
    }, 'Starting audit execution');

    const costTracker = new CostTracker();
    let parentTrace: RunTree | undefined;
    try {
        parentTrace = await createParentTrace(audit.id, "audit-data-collection", {
            businessName: name,
            city: city || undefined,
            url: url || undefined
        });
    } catch (e) {
        console.error("Failed to create parent trace", e);
    }

    const moduleInput: ModuleInput = {
        auditId: audit.id,
        url: url || undefined,
        businessName: name || undefined,
        city: city || undefined,
        industry: audit.businessIndustry || undefined,
        tenantId: audit.tenantId
    };

    const results = new Map<string, ModuleResult>();

    // Phase 1: Foundation
    await executePhase(1, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace);

    // Phase 2: Analysis (uses Phase 1 outputs)
    await executePhase(2, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace);

    // Phase 3: Synthesis (uses Phase 1 + 2 outputs)
    await executePhase(3, MODULE_REGISTRY, results, moduleInput, costTracker, parentTrace);

    const allFindings: any[] = [];
    const modulesCompleted: string[] = [];
    const modulesFailed: any[] = [];

    // Synthesize results into discoveries and evidence
    for (const [modName, res] of Array.from(results.entries())) {
        if (res.status === 'COMPLETE') {
            modulesCompleted.push(modName);
            const ext = extractFindingsFromRegistryResult(modName, res, moduleInput);
            allFindings.push(...ext.findings);

            for (const snap of ext.snapshots) {
                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: modName,
                        source: snap.source || modName,
                        rawResponse: snap.rawResponse ?? snap,
                        tenantId: audit.tenantId,
                    }
                }).catch(() => null);
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
            description: 'No Google Business listing was found for this business. This is a major missed opportunity.',
            evidence: [{ type: 'text', value: 'Places API returned no results', label: 'Search' }],
            metrics: { businessName: name, city },
            impactScore: 9,
            confidenceScore: 90,
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Create a Google Business Profile'],
        });
    }

    // Create Finding records in DB
    if (allFindings.length > 0) {
        await prisma.finding.createMany({
            data: allFindings.map(f => ({
                ...f,
                auditId: audit.id,
                tenantId: audit.tenantId,
                manuallyEdited: false,
                excluded: false
            }))
        });
    }

    // Calculate total API cost
    const totalCostCents = costTracker.getTotalCents();

    // Determine final status
    const totalModules = MODULE_REGISTRY.filter(m => !m.optional).length;
    const completedRequiredModules = [...results.entries()].filter(([n, r]) => {
        const specs = MODULE_REGISTRY.find(x => x.name === n);
        return specs && !specs.optional && r.status === 'COMPLETE';
    }).length;

    const finalStatus = completedRequiredModules >= totalModules * 0.8
        ? 'COMPLETE'
        : completedRequiredModules >= totalModules * 0.5
            ? 'PARTIAL'
            : completedRequiredModules >= 1
                ? 'DEGRADED'
                : 'FAILED';

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
            status: finalStatus === 'DEGRADED' ? 'FAILED' : finalStatus, // Map DEGRADED to FAILED for Prisma constraints since DEGRADED is not in the Enum
            modulesCompleted,
            modulesFailed,
            apiCostCents: totalCostCents,
            completedAt: new Date(),
            businessIndustry: detectedIndustry ?? undefined,
            verticalPlaybookId: verticalPlaybookId !== 'general' ? verticalPlaybookId : undefined,
        },
    });

    const duration_ms = Date.now() - startTime;

    logger.info({
        event: 'audit.complete',
        auditId: audit.id,
        status: finalStatus,
        findingsCount: allFindings.length,
        modulesCompleted: modulesCompleted.length,
        modulesFailed: modulesFailed.length,
        duration_ms,
        apiCostCents: totalCostCents
    }, 'Audit complete');

    return {
        success: true,
        auditId: audit.id,
        status: finalStatus,
        modulesCompleted,
        modulesFailed,
        findingsCount: allFindings.length,
        costCents: totalCostCents,
        duration_ms,
    };
}
