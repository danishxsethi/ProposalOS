#!/usr/bin/env npx tsx
/**
 * Test accessibility module with 3 URLs:
 * 1. Good accessibility (e.g. gov.uk, a11y project)
 * 2. Partial accessibility
 * 3. Poor accessibility
 */
import { runAccessibilityModule } from '../lib/modules/accessibility';
import { generateAccessibilityFindings } from '../lib/modules/findingGenerator';

const TEST_URLS = {
    good: 'https://www.w3.org/WAI/WCAG21/quickref/',
    partial: 'https://example.com',
    poor: 'https://info.cern.ch', // Early web, minimal structure
};

async function main() {
    console.log('=== Accessibility Module Test ===\n');

    for (const [label, url] of Object.entries(TEST_URLS)) {
        console.log(`\n--- ${label.toUpperCase()}: ${url} ---`);
        try {
            const result = await runAccessibilityModule({ url });
            const data = (result.data as { status?: string; data?: unknown })?.data ?? result.data;

            if (data && typeof data === 'object') {
                const d = data as {
                    score?: number;
                    wcagLevel?: string;
                    totalIssues?: number;
                    criticalIssues?: number;
                    issuesByCategory?: typeof data;
                    recommendations?: string[];
                };
                console.log('Score:', d.score, '/ 100');
                console.log('WCAG Level:', d.wcagLevel);
                console.log('Total issues:', d.totalIssues);
                console.log('Critical issues:', d.criticalIssues);
                console.log('Recommendations:', d.recommendations?.slice(0, 2).join(' | ') ?? '');
            }

            const findings = generateAccessibilityFindings(data as never, url);
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
