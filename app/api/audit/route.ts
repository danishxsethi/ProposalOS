import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runWebsiteModule } from '@/lib/modules/website';
import { runGBPModule } from '@/lib/modules/gbp';
import { runCompetitorModule } from '@/lib/modules/competitor';
import {
    generateWebsiteFindings,
    generateGBPFindings,
    generateCompetitorFindings,
} from '@/lib/modules/findingGenerator';
import { extractBusinessFromUrl } from '@/lib/utils/urlExtractor';
import { detectIndustryFromCategory } from '@/lib/proposal/pricing';
import { CostTracker } from '@/lib/costs/costTracker';

import { withAuth } from '@/lib/middleware/auth';

export const POST = withAuth(async (req: Request) => {
    try {
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

        // Create Audit record in DB
        const audit = await prisma.audit.create({
            data: {
                businessName: name || 'Unknown',
                businessCity: city,
                businessUrl: url,
                status: 'QUEUED',
            },
        });

        // Update status to RUNNING
        await prisma.audit.update({
            where: { id: audit.id },
            data: { status: 'RUNNING', startedAt: new Date() },
        });

        // Create CostTracker
        const tracker = new CostTracker();

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
            modulesFailed.push({ module: 'website', error: websiteResult.status === 'fulfilled' ? websiteResult.value.error : 'Promise rejected' });
        }

        // Process GBP Module
        if (gbpResult.status === 'fulfilled' && gbpResult.value.status === 'success') {
            modulesCompleted.push('gbp');
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
            modulesFailed.push({ module: 'gbp', error: gbpResult.status === 'fulfilled' ? gbpResult.value.error : 'Promise rejected' });
        }

        // Process Competitor Module
        if (competitorResult.status === 'fulfilled' && competitorResult.value.status === 'success') {
            modulesCompleted.push('competitor');
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
            modulesFailed.push({ module: 'competitor', error: competitorResult.status === 'fulfilled' ? competitorResult.value.error : 'Promise rejected' });
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
        const finalStatus = modulesCompleted.length === 3 ? 'COMPLETE' : modulesCompleted.length > 0 ? 'PARTIAL' : 'FAILED';

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

        return NextResponse.json({
            success: true,
            auditId: audit.id,
            status: finalStatus,
            modulesCompleted,
            modulesFailed: modulesFailed.length > 0 ? modulesFailed : undefined,
            findingsCount: allFindings.length,
            apiCostCents: totalCostCents,
            costUSD: (totalCostCents / 100).toFixed(2),
        });

    } catch (error) {
        console.error('Error running audit:', error);
        return NextResponse.json(
            { error: 'Internal Server Server', details: String(error) },
            { status: 500 }
        );
    }
});
