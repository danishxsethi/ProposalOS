
import { prisma } from '@/lib/prisma';
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
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';

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
        // Run modules in parallel (GCP-native approach)
        const [websiteResult, gbpResult, competitorResult] = await Promise.allSettled([
            url ? runWebsiteModule({ url }, tracker) : Promise.resolve({ status: 'failed', error: 'No URL provided' } as any),
            name && city ? runGBPModule({ businessName: name, city }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
            name && city ? runCompetitorModule({ keyword: name, location: city }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
        ]);

        // Track which modules completed
        const modulesCompleted: string[] = [];
        const modulesFailed: any[] = [];
        const allFindings: any[] = [];

        // Process Website Module
        if (websiteResult.status === 'fulfilled' && websiteResult.value.status === 'success') {
            modulesCompleted.push('website');
            const findings = generateWebsiteFindings(websiteResult.value.data);
            allFindings.push(...findings);

            // Store evidence
            await prisma.evidenceSnapshot.create({
                data: {
                    auditId: audit.id,
                    module: 'website',
                    source: 'PageSpeed Insights API',
                    rawResponse: websiteResult.value.data,
                },
            });
        } else {
            const err = websiteResult.status === 'fulfilled' ? websiteResult.value.error : 'Promise rejected';
            modulesFailed.push({ module: 'website', error: err });
            Metrics.increment('modules_failed');
            logger.error({
                event: 'module.failed',
                auditId: audit.id,
                module: 'website',
                error: err
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

            const findings = generateGBPFindings(gbpResult.value.data, name || 'Unknown');
            allFindings.push(...findings);

            await prisma.evidenceSnapshot.create({
                data: {
                    auditId: audit.id,
                    module: 'gbp',
                    source: 'Google Places API',
                    rawResponse: gbpResult.value.data,
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

        // Create Finding records in DB
        for (const finding of allFindings) {
            await prisma.finding.create({
                data: {
                    auditId: audit.id,
                    ...finding,
                },
            });
        }

        // Calculate total API cost
        const totalCostCents = tracker.getTotalCents();
        console.log(`[Audit] Total Cost: ${totalCostCents} cents`, tracker.getReport());

        // Determine final status
        const finalStatus = modulesCompleted.length >= 4 ? 'COMPLETE' : modulesCompleted.length > 0 ? 'PARTIAL' : 'FAILED';

        // Detect industry if GBP data available
        let detectedIndustry: string | null = null;
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success' && gbpResult.value.data.types) {
            for (const type of gbpResult.value.data.types) {
                const industry = detectIndustryFromCategory(type);
                if (industry !== 'general') {
                    detectedIndustry = industry;
                    break;
                }
            }
        }

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
            findingsCount: allFindings.length
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
