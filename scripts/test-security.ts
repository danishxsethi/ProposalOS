#!/usr/bin/env npx tsx
/**
 * Test security module with 3 URLs:
 * 1. Good security (e.g. google.com, github.com)
 * 2. Partial security
 * 3. Poor security (http, missing headers)
 */
import { runSecurityModule } from '../lib/modules/security';
import { generateSecurityFindings } from '../lib/modules/findingGenerator';

const TEST_URLS = {
    good: 'https://www.google.com',
    partial: 'https://example.com',
    poor: 'http://info.cern.ch',
};

async function main() {
    console.log('=== Security Module Test ===\n');

    for (const [label, url] of Object.entries(TEST_URLS)) {
        console.log(`\n--- ${label.toUpperCase()}: ${url} ---`);
        try {
            const result = await runSecurityModule({ url });
            const data = (result.data as { status?: string; data?: unknown })?.data ?? result.data;

            if (data && typeof data === 'object') {
                const d = data as {
                    score?: number;
                    grade?: string;
                    https?: { enabled?: boolean; redirects?: boolean; certificate?: { valid?: boolean; expiresAt?: string; issuer?: string } };
                    mixedContent?: boolean;
                    serverExposed?: boolean;
                    recommendations?: string[];
                };
                console.log('Score:', d.score, '/ 100');
                console.log('Grade:', d.grade);
                console.log('HTTPS:', d.https?.enabled, '| Redirects:', d.https?.redirects);
                console.log('Certificate valid:', d.https?.certificate?.valid, '| Expires:', d.https?.certificate?.expiresAt);
                console.log('Mixed content:', d.mixedContent);
                console.log('Recommendations:', d.recommendations?.slice(0, 2).join(' | ') ?? '');
            }

            const findings = generateSecurityFindings(data as never, url);
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
