import { prisma } from '@/lib/prisma';
import { CANONICAL_MODULES } from '@/lib/audit/modules';
import { runWebsiteModule } from '@/lib/modules/website';
import { runGBPModule } from '@/lib/modules/gbp';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runReputationModule } from '@/lib/modules/reputation';
import { runSocialModule } from '@/lib/modules/social';
import { runSchemaMarkupModule } from '@/lib/modules/schemaMarkup';
import { runAccessibilityModule } from '@/lib/modules/accessibility';
import { runSecurityModule } from '@/lib/modules/security';
import { runConversionModule, type ConversionResult } from '@/lib/modules/conversion';
import {
    generateWebsiteFindings,
    generateGBPFindings,
    generateCompetitorFindings,
    generateReputationFindings,
    generateSocialFindings,
    generateSchemaMarkupFindings,
    generateAccessibilityFindings,
    generateSecurityFindings,
    generateConversionFindings,
} from '@/lib/modules/findingGenerator';
import { detectIndustryFromCategory } from '@/lib/proposal/pricing';
import { detectVertical } from '@/lib/playbooks';
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
            name && city ? runGBPModule({ businessName: name, city, websiteUrl: url ?? undefined }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
            name && city ? runCompetitorModule({ keyword: name, location: city }, tracker) : Promise.resolve({ status: 'failed', error: 'No name/city' } as any),
        ]);

        // Track which modules completed
        const modulesCompleted: string[] = [];
        const modulesFailed: any[] = [];
        const allFindings: any[] = [];

        // Process Website Module
        // Handle both formats: { status, data } (legacy) and { findings, evidenceSnapshots } (direct)
        if (websiteResult.status === 'fulfilled') {
            const value = websiteResult.value as any;
            const isLegacySuccess = value.status === 'success' && value.data;
            const isDirectSuccess = Array.isArray(value.findings);

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
                    // Ensure each finding has module: 'website' for Prisma
                    findings = value.findings.map((f: any) => ({ ...f, module: f.module || 'website' }));
                } else {
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

        // Process Schema Markup Module (depends on website URL)
        if (url) {
            const gbpTypes = gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success'
                ? (gbpResult.value.data as { types?: string[] })?.types
                : undefined;
            const schemaMarkupResult = await runSchemaMarkupModule(
                { url, businessName: name || undefined, gbpTypes },
                tracker
            );

            if (schemaMarkupResult.status === 'success' && schemaMarkupResult.data) {
                modulesCompleted.push('schemaMarkup');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'schemaMarkup',
                }, 'Schema Markup module complete');

                const schemaData = schemaMarkupResult.data as { status?: string; data?: unknown };
                const innerData = schemaData.data ?? schemaMarkupResult.data;
                const findings = generateSchemaMarkupFindings(innerData, url);
                allFindings.push(...findings);

                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: 'schemaMarkup',
                        source: 'Website HTML',
                        rawResponse: schemaMarkupResult.data,
                        tenantId: audit.tenantId,
                    },
                });
            }
        }

        // Process Accessibility Module (depends on website URL)
        if (url) {
            const accessibilityResult = await runAccessibilityModule({ url }, tracker);

            if (accessibilityResult.status === 'success' && accessibilityResult.data) {
                modulesCompleted.push('accessibility');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'accessibility',
                }, 'Accessibility module complete');

                const accData = accessibilityResult.data as { status?: string; data?: unknown };
                const innerData = accData.data ?? accessibilityResult.data;
                const findings = generateAccessibilityFindings(innerData, url);
                allFindings.push(...findings);

                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: 'accessibility',
                        source: 'axe-core + custom checks',
                        rawResponse: accessibilityResult.data,
                        tenantId: audit.tenantId,
                    },
                });
            }
        }

        // Process Security Module (depends on website URL)
        if (url) {
            const securityResult = await runSecurityModule({ url }, tracker);

            if (securityResult.status === 'success' && securityResult.data) {
                modulesCompleted.push('security');
                Metrics.increment('modules_total');
                logger.info({
                    event: 'module.complete',
                    auditId: audit.id,
                    module: 'security',
                }, 'Security module complete');

                const secData = securityResult.data as { status?: string; data?: unknown };
                const innerData = secData.data ?? securityResult.data;
                const findings = generateSecurityFindings(innerData, url);
                allFindings.push(...findings);

                await prisma.evidenceSnapshot.create({
                    data: {
                        auditId: audit.id,
                        module: 'security',
                        source: 'HTTPS + headers scan',
                        rawResponse: securityResult.data,
                        tenantId: audit.tenantId,
                    },
                });
            }
        }

        // Process Conversion Module (depends on website URL)
        if (url) {
            let detectedIndustry = 'general';
            if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success') {
                const gbpData = gbpResult.value.data as { types?: string[] };
                for (const type of gbpData.types ?? []) {
                    const industry = detectIndustryFromCategory(type);
                    if (industry !== 'general') {
                        detectedIndustry = industry;
                        break;
                    }
                }
            }
            const competitorData = competitorResult.status === 'fulfilled' && competitorResult.value.status === 'success'
                ? competitorResult.value.data
                : undefined;

            const conversionResult = await runConversionModule({ url, businessName: name, industry: detectedIndustry }, tracker);

            if (conversionResult.status === 'success' && conversionResult.data) {
                const convData = conversionResult.data as ConversionResult;
                if (convData.status === 'success' && convData.data) {
                    modulesCompleted.push('conversion');
                    Metrics.increment('modules_total');
                    logger.info({
                        event: 'module.complete',
                        auditId: audit.id,
                        module: 'conversion',
                    }, 'Conversion module complete');

                    const findings = generateConversionFindings(convData.data, url, competitorData);
                    allFindings.push(...findings);

                    await prisma.evidenceSnapshot.create({
                        data: {
                            auditId: audit.id,
                            module: 'conversion',
                            source: 'Puppeteer DOM analysis',
                            rawResponse: conversionResult.data,
                            tenantId: audit.tenantId,
                        },
                    });
                }
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
