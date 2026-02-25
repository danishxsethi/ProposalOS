import { prisma } from '@/lib/prisma';
import { CANONICAL_MODULES } from '@/lib/audit/modules';
import { runWebsiteModule } from '@/lib/modules/website';
import { runGBPModule } from '@/lib/modules/gbp';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runReputationModule } from '@/lib/modules/reputation';
import { runSocialModule } from '@/lib/modules/social';
import {
    generateWebsiteFindings,
    generateGBPFindings,
    generateCompetitorFindings,
    generateReputationFindings,
    generateSocialFindings,
} from '@/lib/modules/findingGenerator';
import { detectIndustryFromCategory } from '@/lib/proposal/pricing';
import { detectVertical } from '@/lib/playbooks';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';

/**
 * Retry configuration for module executions
 */
const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    timeoutMs: 30000, // 30 second timeout per attempt
} as const;

/**
 * Content module specification for each canonical module
 */
export interface ModuleSpec {
    id: string;
    name: string;
    timeoutMs: number;
    requiredForComplete: boolean;
    dependencies?: string[];
}

export const MODULE_SPECS: Record<string, ModuleSpec> = {
    website: {
        id: 'website',
        name: 'Website Analysis',
        timeoutMs: 45000,
        requiredForComplete: true,
    },
    gbp: {
        id: 'gbp',
        name: 'Google Business Profile',
        timeoutMs: 30000,
        requiredForComplete: true,
    },
    competitor: {
        id: 'competitor',
        name: 'Competitor Analysis',
        timeoutMs: 30000,
        requiredForComplete: true,
    },
    reputation: {
        id: 'reputation',
        name: 'Reputation Analysis',
        timeoutMs: 60000,
        requiredForComplete: false,
        dependencies: ['gbp'],
    },
    social: {
        id: 'social',
        name: 'Social Media Analysis',
        timeoutMs: 30000,
        requiredForComplete: false,
        dependencies: ['website'],
    },
};

/**
 * Execute a function with retry logic and timeout
 */
async function withTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    options: {
        timeout?: number;
        maxRetries?: number;
        backoff?: 'exponential';
        onRetry?: (attempt: number, error: Error) => void;
    } = {}
): Promise<T | { status: 'failed'; error: string }> {
    const {
        maxRetries = 3,
        timeout = 30000,
        backoff = 'exponential',
        onRetry,
    } = options;

    const initialDelayMs = 1000;
    const maxDelayMs = 10000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Operation timed out after ${timeout}ms`));
                }, timeout);
            });

            // Race the function against timeout
            const result = await Promise.race([fn(), timeoutPromise]);
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = backoff === 'exponential'
                    ? Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs)
                    : initialDelayMs;

                logger.warn({
                    event: 'module.retry',
                    attempt: attempt + 1,
                    maxRetries,
                    delayMs: delay,
                    error: lastError.message,
                }, 'Module execution failed, retrying...');

                if (onRetry) {
                    onRetry(attempt + 1, lastError);
                }

                // Add jitter to prevent thundering herd
                const jitter = Math.random() * 0.3 * delay;
                await new Promise(r => setTimeout(r, delay + jitter));
            }
        }
    }

    return { status: 'failed', error: lastError?.message || 'Operation failed after retries' };
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

    // Create CostTracker
    const tracker = new CostTracker();

    // Create parent trace for this audit data collection flow
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

    try {
        // Run modules in parallel with retry logic (GCP-native approach)
        const [websiteResult, gbpResult, competitorResult] = await Promise.allSettled([
            url
                ? withTimeoutAndRetry(() => runWebsiteModule({ url }, tracker), {
                    maxRetries: 3,
                    timeout: MODULE_SPECS.website.timeoutMs,
                    backoff: 'exponential'
                })
                : Promise.resolve({ status: 'failed', error: 'No URL provided' } as any),
            name && city
                ? withTimeoutAndRetry(() => runGBPModule({ businessName: name, city, websiteUrl: url ?? undefined }, tracker), {
                    maxRetries: 3,
                    timeout: MODULE_SPECS.gbp.timeoutMs,
                    backoff: 'exponential'
                })
                : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
            name && city
                ? withTimeoutAndRetry(() => runCompetitorModule({ keyword: name, location: city }, tracker), {
                    maxRetries: 3,
                    timeout: MODULE_SPECS.competitor.timeoutMs,
                    backoff: 'exponential'
                })
                : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
        ]);

        // Track which modules completed
        const modulesCompleted: string[] = [];
        const modulesFailed: any[] = [];
        const allFindings: any[] = [];

        // Process Website Module
        // Handle both formats: { status, data } (legacy) and { findings, evidenceSnapshots } (direct)
        if (websiteResult.status === 'fulfilled') {
            const value = websiteResult.value as any;
            // The website module returns { findings, evidenceSnapshots, data }
            // If value.findings exists, it's the new direct format. 
            // If not, it might be the legacy { status: 'success', data: ... } format.
            const isDirectSuccess = value && Array.isArray(value.findings);
            const isLegacySuccess = !isDirectSuccess && value && value.status === 'success' && value.data;

            if (isLegacySuccess || isDirectSuccess) {
                modulesCompleted.push('website');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'website',
                }, 'Website module complete');

                let findings: any[] = [];
                if (isDirectSuccess) {
                    // Normalize findings from direct format
                    findings = value.findings.map((f: any) => ({ ...f, module: f.module || 'website' }));
                } else {
                    // Normalize findings from legacy data format
                    findings = generateWebsiteFindings(value.data);
                }
                allFindings.push(...findings);

                // Store evidence
                const rawResponse = isDirectSuccess ? value : value.data;
                const snapshots = value.evidenceSnapshots || [];
                if (snapshots.length > 0) {
                    for (const snap of snapshots) {
                        await prisma.evidenceSnapshot.create({
                            data: {
                                auditId: audit.id,
                                module: 'website',
                                source: snap.source || 'Website Crawler',
                                rawResponse: snap.rawResponse ?? snap,
                                tenantId: audit.tenantId,
                            },
                        });
                    }
                } else {
                    await prisma.evidenceSnapshot.create({
                        data: {
                            auditId: audit.id,
                            module: 'website',
                            source: 'PageSpeed Insights API',
                            rawResponse: rawResponse,
                            tenantId: audit.tenantId,
                        },
                    });
                }
            } else {
                const err = value?.error || 'Unknown error';
                modulesFailed.push({ module: 'website', error: err });
                Metrics.increment('modules_failed');
                logger.error({
                    event: 'module.failed',
                    auditId: audit.id,
                    module: 'website',
                    error: err
                }, 'Website module failed');
            }
        } else {
            modulesFailed.push({ module: 'website', error: 'Promise rejected' });
            Metrics.increment('modules_failed');
            logger.error({
                event: 'module.failed',
                auditId: audit.id,
                module: 'website',
                error: 'Promise rejected'
            }, 'Website module failed');
        }

        // Process GBP Module
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success') {
            modulesCompleted.push('gbp');
            Metrics.increment('modules_total');
            logger.info({
                event: 'module.complete',
                auditId: audit.id,
                module: 'gbp',
            }, 'GBP module complete');

            const competitorData = competitorResult.status === 'fulfilled' && competitorResult.value.status === 'success'
                ? competitorResult.value.data
                : undefined;
            const findings = generateGBPFindings(gbpResult.value.data, name || 'Unknown', competitorData);
            allFindings.push(...findings);

            await prisma.evidenceSnapshot.create({
                data: {
                    auditId: audit.id,
                    module: 'gbp',
                    source: 'Google Places API',
                    rawResponse: gbpResult.value.data,
                    tenantId: audit.tenantId,
                },
            });
        } else {
            const err = gbpResult.status === 'fulfilled' ? gbpResult.value.error : 'Promise rejected';
            modulesFailed.push({ module: 'gbp', error: err });
            Metrics.increment('modules_failed');
            logger.error({
                event: 'module.failed',
                auditId: audit.id,
                module: 'gbp',
                error: err
            }, 'GBP module failed');
            // Add finding when no Google Business listing — major missed opportunity
            allFindings.push({
                module: 'gbp',
                category: 'Local SEO',
                type: 'PAINKILLER',
                title: 'No Google Business Listing Detected',
                description: 'No Google Business listing was found for this business. This is a major missed opportunity — 76% of people who search for something nearby visit a business within 24 hours. A GBP profile drives calls, directions, and website visits.',
                evidence: [{ type: 'text', value: 'Places API returned no results', label: 'Search' }],
                metrics: { businessName: name, city },
                impactScore: 9,
                confidenceScore: 90,
                effortEstimate: 'MEDIUM',
                recommendedFix: [
                    'Create a Google Business Profile at business.google.com',
                    'Verify the business with a postcard or phone',
                    'Add complete NAP (Name, Address, Phone), hours, photos, and services',
                    'Encourage customers to leave reviews'
                ],
            });
        }

        // Process Competitor Module
        if (competitorResult.status === 'fulfilled' && competitorResult.value.status === 'success') {
            modulesCompleted.push('competitor');
            Metrics.increment('modules_total');
            logger.info({
                event: 'module.complete',
                auditId: audit.id,
                module: 'competitor',
            }, 'Competitor module complete');

            const findings = generateCompetitorFindings(competitorResult.value.data, name || 'Unknown');
            allFindings.push(...findings);

            await prisma.evidenceSnapshot.create({
                data: {
                    auditId: audit.id,
                    module: 'competitor',
                    source: 'SerpAPI',
                    rawResponse: competitorResult.value.data,
                    tenantId: audit.tenantId,
                },
            });
        } else {
            const err = competitorResult.status === 'fulfilled' ? competitorResult.value.error : 'Promise rejected';
            modulesFailed.push({ module: 'competitor', error: err });
            Metrics.increment('modules_failed');
            logger.error({
                event: 'module.failed',
                auditId: audit.id,
                module: 'competitor',
                error: err
            }, 'Competitor module failed');
        }

        // Process Reputation Module (depends on GBP reviews)
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success' && gbpResult.value.data.reviews?.length > 0) {
            const reputationResult = await runReputationModule(
                { reviews: gbpResult.value.data.reviews, businessName: name || 'Unknown' },
                tracker,
                parentTrace
            );

            if (reputationResult.status === 'success' && !reputationResult.data?.skipped) {
                modulesCompleted.push('reputation');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'reputation',
                }, 'Reputation module complete');

                const findings = generateReputationFindings(reputationResult.data);
                allFindings.push(...findings);

                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: 'reputation',
                        source: 'Gemini AI + Google Reviews',
                        rawResponse: reputationResult.data,
                        tenantId: audit.tenantId,
                    },
                });
            } else if (reputationResult.status === 'failed') {
                modulesFailed.push({ module: 'reputation', error: reputationResult.error });
                Metrics.increment('modules_failed');
                logger.error({
                    event: 'module.failed',
                    auditId: audit.id,
                    module: 'reputation',
                    error: reputationResult.error
                }, 'Reputation module failed');
            }
        }

        // Process Social Module (depends on website URL)
        if (url) {
            const socialResult = await runSocialModule(
                { websiteUrl: url, businessName: name || 'Unknown' },
                tracker
            );

            if (socialResult.status === 'success' && !socialResult.data?.skipped) {
                modulesCompleted.push('social');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'social',
                }, 'Social module complete');

                const findings = generateSocialFindings(socialResult.data);
                allFindings.push(...findings);

                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: 'social',
                        source: 'Website HTML',
                        rawResponse: socialResult.data,
                        tenantId: audit.tenantId,
                    },
                });
            } else if (socialResult.status === 'failed') {
                modulesFailed.push({ module: 'social', error: socialResult.error });
                Metrics.increment('modules_failed');
                logger.error({
                    event: 'module.failed',
                    auditId: audit.id,
                    module: 'social',
                    error: socialResult.error
                }, 'Social module failed');
            }
        }

        // Create Finding records in DB (Batch Insert)
        if (allFindings.length > 0) {
            await prisma.finding.createMany({
                data: allFindings.map(f => ({
                    ...f,
                    auditId: audit.id,
                    tenantId: audit.tenantId, // Ensure tenant consistency
                    manuallyEdited: false,
                    excluded: false
                }))
            });
        }

        // Calculate total API cost
        const totalCostCents = tracker.getTotalCents();
        console.log(`[Audit] Total Cost: ${totalCostCents} cents`, tracker.getReport());

        // Determine final status (COMPLETE if most canonical modules succeeded)
        const minForComplete = CANONICAL_MODULES.length - 1;
        const finalStatus = modulesCompleted.length >= minForComplete ? 'COMPLETE' : modulesCompleted.length > 0 ? 'PARTIAL' : 'FAILED';

        // Detect industry if GBP data available
        let detectedIndustry: string | null = null;
        const gbpTypes: string[] = [];
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success' && gbpResult.value.data) {
            const gbpData = gbpResult.value.data as { types?: string[]; reviewCount?: number; rating?: number };
            if (gbpData.types) {
                gbpTypes.push(...gbpData.types);
                for (const type of gbpData.types) {
                    const industry = detectIndustryFromCategory(type);
                    if (industry !== 'general') {
                        detectedIndustry = industry;
                        break;
                    }
                }
            }
        }

        // Detect vertical playbook (for proposal customization)
        const gbpData = gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success' ? (gbpResult.value.data as { reviewCount?: number; rating?: number }) : null;
        const verticalPlaybookId = detectVertical({
            businessName: name,
            businessIndustry: detectedIndustry,
            businessCity: city,
            businessUrl: url,
            gbpCategories: gbpTypes,
            reviewCount: gbpData?.reviewCount,
            rating: gbpData?.rating,
        });

        // Update audit with results
        await prisma.audit.update({
            where: { id: audit.id },
            data: {
                status: finalStatus,
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

    } catch (error) {
        logError('Error running audit execution', error, { auditId });
        Metrics.increment('audits_failed');

        await prisma.audit.update({
            where: { id: auditId },
            data: { status: 'FAILED' }
        });

        throw error;
    }
}
