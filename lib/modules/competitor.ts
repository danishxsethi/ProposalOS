import { AuditModuleResult, CompetitorModuleInput } from './types';
import { CostTracker } from '@/lib/costs/costTracker';

const SERP_API_BASE = 'https://serpapi.com/search';

export async function runCompetitorModule(input: CompetitorModuleInput, tracker?: CostTracker): Promise<AuditModuleResult> {
    console.log(`[CompetitorModule] Searching for '${input.keyword}' in ${input.location}...`);

    if (!process.env.SERP_API_KEY) {
        throw new Error('SERP_API_KEY is missing');
    }

    try {
        tracker?.addApiCall('SERP_API');
        const params = new URLSearchParams({
            engine: 'google_local',
            q: input.keyword,
            location: input.location,
            api_key: process.env.SERP_API_KEY,
            google_domain: 'google.com',
            gl: 'us',
            hl: 'en',
        });

        const response = await fetch(`${SERP_API_BASE}?${params.toString()}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(`SerpAPI Error: ${data.error}`);
        }

        const localResults = data.local_results || [];

        // Map to a simplified format
        const competitors = localResults.slice(0, 3).map((result: any) => ({
            name: result.title,
            rating: result.rating,
            reviews: result.reviews,
            type: result.type,
            address: result.address,
            place_id: result.place_id,
            position: result.position,
        }));

        return {
            moduleId: 'competitor-audit',
            status: 'success',
            timestamp: new Date().toISOString(),
            // costCents is tracked via CostTracker
            data: {
                keyword: input.keyword,
                location: input.location,
                totalResults: localResults.length,
                topCompetitors: competitors,
            }
        };

    } catch (error) {
        console.error('[CompetitorModule] Error:', error);
        return {
            moduleId: 'competitor-audit',
            status: 'failed',
            timestamp: new Date().toISOString(),
            costCents: 0,
            data: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
