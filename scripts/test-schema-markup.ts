#!/usr/bin/env npx ts-node
/**
 * Test schema markup module with 3 URLs:
 * 1. Good schema (e.g. schema.org, or a site with full LocalBusiness)
 * 2. Partial schema
 * 3. No schema
 */
import { runSchemaMarkupModule } from '../lib/modules/schemaMarkup';
import { generateSchemaMarkupFindings } from '../lib/modules/findingGenerator';

const TEST_URLS = {
    good: 'https://schema.org', // schema.org has extensive structured data
    partial: 'https://www.google.com', // Google has some schema
    none: 'https://example.com', // example.com typically has minimal/no schema
};

async function main() {
    console.log('=== Schema Markup Module Test ===\n');

    for (const [label, url] of Object.entries(TEST_URLS)) {
        console.log(`\n--- ${label.toUpperCase()}: ${url} ---`);
        try {
            const result = await runSchemaMarkupModule({ url });
            const data = (result.data as { status?: string; data?: unknown })?.data ?? result.data;

            console.log('Status:', (result.data as { status?: string })?.status ?? result.status);
            if (data && typeof data === 'object') {
                const d = data as {
                    schemasFound?: unknown[];
                    schemasExpected?: string[];
                    schemasMissing?: string[];
                    score?: number;
                    recommendations?: string[];
                };
                console.log('Score:', d.score, '/ 100');
                console.log('Schemas found:', d.schemasFound?.length ?? 0);
                console.log('Schemas expected:', d.schemasExpected?.join(', ') ?? '');
                console.log('Schemas missing:', d.schemasMissing?.join(', ') ?? '');
                console.log('Recommendations:', d.recommendations?.slice(0, 2).join(' | ') ?? '');
            }

            const findings = generateSchemaMarkupFindings(data as never, url);
            console.log('Findings generated:', findings.length);
            findings.slice(0, 2).forEach((f, i) => {
                console.log(`  ${i + 1}. ${f.title}`);
            });
        } catch (err) {
            console.error('Error:', err instanceof Error ? err.message : err);
        }
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
