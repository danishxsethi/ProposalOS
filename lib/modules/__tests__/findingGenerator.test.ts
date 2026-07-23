
import { describe, it, expect } from 'vitest';
import { generateWebsiteFindings, generateGBPFindings } from '../findingGenerator';

describe('Finding Generator', () => {
    describe('generateWebsiteFindings', () => {
        it('should generate PAINKILLER for low performance', () => {
            const data = {
                scores: { performance: 0.4, seo: 0.9, accessibility: 0.9 },
                coreWebVitals: {},
                finalUrl: 'https://example.com'
            };
            const findings = generateWebsiteFindings(data);
            const perfFinding = findings.find(f => f.category === 'performance');

            expect(perfFinding).toBeDefined();
            expect(perfFinding?.type).toBe('PAINKILLER');
            expect(perfFinding?.impactScore).toBeGreaterThanOrEqual(8);
        });

        it('should generate VITAMIN for distinct issues', () => {
            const data = {
                scores: { performance: 0.9, seo: 0.6, accessibility: 0.9 },
                coreWebVitals: {},
                finalUrl: 'https://example.com'
            };
            const findings = generateWebsiteFindings(data);
            const seoFinding = findings.find(f => f.category === 'visibility');

            expect(seoFinding).toBeDefined();
            expect(seoFinding?.type).toBe('VITAMIN');
        });
    });

    describe('generateGBPFindings', () => {
        it('should report missing website as PAINKILLER', () => {
            const data = {
                rating: 4.5,
                reviewCount: 50,
                website: null, // Missing
                photos: [],
                openingHours: {}
            };
            const findings = generateGBPFindings(data, 'Test Biz');
            const websiteFinding = findings.find(f => f.category === 'conversion' && f.title.includes('No website'));

            expect(websiteFinding).toBeDefined();
            expect(websiteFinding?.type).toBe('PAINKILLER');
        });
    });
});
