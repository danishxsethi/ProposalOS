import { AuditModuleResult, WebsiteModuleInput } from './types';
import { CostTracker } from '@/lib/costs/costTracker';

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runWebsiteModule(input: WebsiteModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    console.log(`[WebsiteModule] Analyzing ${input.url}...`);
    tracker?.addApiCall('PAGESPEED');

    if (!process.env.GOOGLE_PAGESPEED_API_KEY) {
        throw new Error('GOOGLE_PAGESPEED_API_KEY is missing');
    }

    try {
        const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
        const strategies = ['mobile', 'desktop'];
        const results: any = {};

        // For MVP transparency/speed, we might just run mobile performance + seo
        // But let's try to get mobile performance as the primary metric
        const params = new URLSearchParams({
            url: input.url,
            key: process.env.GOOGLE_PAGESPEED_API_KEY,
            strategy: 'mobile',
        });

        // Add categories
        categories.forEach(cat => params.append('category', cat));

        const response = await fetch(`${PSI_API_URL}?${params.toString()}`);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`PSI API failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        // Extract key metrics for our findings
        const lighthouse = data.lighthouseResult;
        const scores = {
            performance: lighthouse.categories.performance?.score || 0,
            accessibility: lighthouse.categories.accessibility?.score || 0,
            bestPractices: lighthouse.categories['best-practices']?.score || 0,
            seo: lighthouse.categories.seo?.score || 0,
        };

        // Extract Core Web Vitals (field data) if available
        const loadingExperience = data.loadingExperience || {};
        const coreWebVitals = {
            fcp: loadingExperience.metrics?.FIRST_CONTENTFUL_PAINT_MS?.category || 'UNKNOWN',
            lcp: loadingExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.category || 'UNKNOWN',
            cls: loadingExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category || 'UNKNOWN',
        };

        return {
            moduleId: 'website-performance',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                scores,
                coreWebVitals,
                finalUrl: lighthouse.finalUrl,
                screenshot: lighthouse.audits?.['final-screenshot']?.details?.data, // Base64 image
            }
        };

    } catch (error) {
        console.error('[WebsiteModule] Error:', error);
        return {
            moduleId: 'website-performance',
            status: 'failed',
            timestamp: new Date().toISOString(),
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
