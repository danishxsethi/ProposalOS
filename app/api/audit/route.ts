import { NextResponse } from 'next/server';
import { runWebsiteModule } from '@/lib/modules/website';
import { runCitationsModule } from '@/lib/modules/citations';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runSeoDeepModule } from '@/lib/modules/seoDeep';
import { runReputationModule } from '@/lib/modules/reputation';
import { runSocialModule } from '@/lib/modules/social';
import {
    generateWebsiteFindings,
    generateGBPFindings,
    generateCompetitorFindings,
    generateReputationFindings,
    generateSocialFindings,
} from '@/lib/modules/findingGenerator';
import { extractBusinessFromUrl } from '@/lib/utils/urlExtractor';
import { detectIndustryFromCategory } from '@/lib/proposal/pricing';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';

import { withAuth } from '@/lib/middleware/auth';
// Tenant Context
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { checkAuditLimit } from '@/lib/billing/limits';

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        // Use Scoped Prisma
        const prisma = createScopedPrisma(tenantId);

        // Parse Body
        const body = await req.json();
        const { url, industry } = body; // accept industry

        // Validate input
        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Check Usage Limits
        const limits = await checkAuditLimit();
        if (!limits.allowed) {
            return NextResponse.json(
                { error: 'Plan Limit Exceeded', details: limits.reason, upgrade: true },
                { status: 429 }
            );
        }

        // Use Scoped Prisma
        const prisma = createScopedPrisma(tenantId);

        const body = await req.json();
        let { name, city, url } = body;

        // Validate input
        if (!url && (!name || !city)) {
            return NextResponse.json(
                { error: 'Must provide either (name + city) or url' },
                { status: 400 }
            );
        }

        // If URL provided without name, extract business info from URL
        if (url && !name) {
            const extracted = await extractBusinessFromUrl(url);
            name = extracted.name;
            url = extracted.url;
            // Note: city is optional when URL provided
        }

        // Create Audit record in DB (TenantId auto-injected by scoped prisma)
        const audit = await prisma.audit.create({
            data: {
                tenantId,
                businessName: 'Pending...',
                businessCity: city,
                businessUrl: url,
                businessIndustry: industry || 'Generic', // Save industry
                status: 'QUEUED',
                apiCostCents: 0,
            },
        });

        const startTime = Date.now();
        Metrics.increment('audits_total');

        logger.info({
            event: 'audit.start',
            auditId: audit.id,
            businessName: name,
            city,
            url,
            tenantId
        }, 'Starting audit');

        // Update status to RUNNING
        await prisma.audit.update({
            where: { id: audit.id },
            data: { status: 'RUNNING', startedAt: new Date() },
        });

        // Create CostTracker
        const tracker = new CostTracker();

        // Create parent trace for this audit data collection flow
        let parentTrace: RunTree | undefined;
        try {
            parentTrace = await createParentTrace(audit.id, "audit-data-collection", {
                businessName: name,
                city,
                url
            });
        } catch (e) {
            console.error("Failed to create parent trace", e);
        }

        // Run modules in parallel (GCP-native approach)
        const [websiteResult, gbpResult, competitorResult, seoDeepResult] = await Promise.allSettled([
            url ? runWebsiteModule({ url }, tracker) : Promise.resolve({ status: 'failed', error: 'No URL provided' } as any),
            name && city ? runGBPModule({ businessName: name, city }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
            name && city ? runCompetitorModule({ keyword: name, location: city }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
            // 6. Deep SEO Module
            url ? runSeoDeepModule({
                url: url,
                businessName: name || 'Unknown',
                city: city || ''
            }, tracker) : Promise.resolve({ status: 'failed', error: 'No URL provided' } as any),
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
            // If skipped (no reviews), don't add to either list
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
            // If skipped (no URL or fetch failed), don't add to either list
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
        // Now 5 modules total (website, gbp, competitor, reputation, social)
        const finalStatus = modulesCompleted.length >= 4 ? 'COMPLETE' : modulesCompleted.length > 0 ? 'PARTIAL' : 'FAILED';

        // Detect industry if GBP data available
        let detectedIndustry: string | null = null;
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success' && gbpResult.value.data.types) {
            // Find first matching industry from types
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

        return NextResponse.json({
            success: true,
            auditId: audit.id,
            status: finalStatus,
            modulesCompleted,
            modulesFailed: modulesFailed.length > 0 ? modulesFailed : undefined,
            findingsCount: allFindings.length,
            apiCostCents: totalCostCents,
            duration_ms,
            costUSD: (totalCostCents / 100).toFixed(2),
        });

    } catch (error) {
        logError('Error running audit', error);
        Metrics.increment('audits_failed');
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
});

    } catch (error) {
    logError('Error running audit', error);
    Metrics.increment('audits_failed');
    return NextResponse.json(
        { error: 'Internal Server Error', details: String(error) },
        { status: 500 }
    );
}
});
