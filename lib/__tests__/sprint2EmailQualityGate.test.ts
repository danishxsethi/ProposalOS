import { describe, expect, it } from 'vitest';
import { checkSniperEmailQuality } from '@/lib/outreach/sprint2/emailQualityGate';

describe('Sprint 2B email quality gate', () => {
    it('passes a short, specific, low-jargon email', () => {
        const result = checkSniperEmailQuality({
            subject: '3 quick fixes for Maple Dental',
            body: 'Site speed is 38/100 and load time is 6.2s. Google profile has 4 photos and 0 owner replies. Scorecard: https://example.com/scorecard. Reply if you want the full plan.',
            requiredFindingSnippets: [
                'Site speed is 38/100',
                'Google profile has 4 photos',
            ],
        });

        expect(result.pass).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(90);
        expect(result.hardFails).toHaveLength(0);
    });

    it('fails when email is generic, long, and jargon-heavy', () => {
        const result = checkSniperEmailQuality({
            subject: 'Quick improvement idea',
            body: 'Your technical SEO and core web vitals need a full schema markup and canonical crawl budget strategy. This guaranteed process will transform outcomes immediately. We should align on implementation dependencies and a comprehensive roadmap before action.',
            requiredFindingSnippets: [
                'Mobile performance is 38/100',
                'Google profile has 4 photos',
            ],
        });

        expect(result.pass).toBe(false);
        expect(result.hardFails.length).toBeGreaterThan(0);
    });
});
