import { describe, expect, it } from 'vitest';
import { hardenExecutiveSummaryForQA, QA_METRIC_PATTERN } from '@/lib/proposal/executiveSummaryQa';

function sentenceCount(text: string): number {
    return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length;
}

describe('hardenExecutiveSummaryForQA', () => {
    it('adds exact business name, city, and metric citations when missing', () => {
        const businessName = 'RE/MAX Bridge City Realty - Real Estate Agency in Saskatoon - Residential -Commercial - Farm Realtor';
        const city = 'Saskatoon';
        const input = 'Performance and visibility need improvement.';

        const out = hardenExecutiveSummaryForQA(input, businessName, city, 6, 3);
        const metricMatches = out.match(QA_METRIC_PATTERN) || [];

        expect(out.toLowerCase()).toContain(businessName.toLowerCase());
        expect(out.toLowerCase()).toContain(city.toLowerCase());
        expect(metricMatches.length).toBeGreaterThanOrEqual(2);
        expect(sentenceCount(out)).toBeGreaterThanOrEqual(2);
    });

    it('trims overly long summaries down to 7 sentences max', () => {
        const input = [
            'Sentence one is here',
            'Sentence two is here',
            'Sentence three is here',
            'Sentence four is here',
            'Sentence five is here',
            'Sentence six is here',
            'Sentence seven is here',
            'Sentence eight is here',
            'Sentence nine is here',
        ].join('. ') + '.';

        const out = hardenExecutiveSummaryForQA(input, 'Acme Dental', 'Saskatoon', 5, 2);
        expect(sentenceCount(out)).toBeLessThanOrEqual(7);
    });

    it('creates a fallback summary when input is empty', () => {
        const out = hardenExecutiveSummaryForQA('', 'Acme Plumbing', 'Saskatoon', 4, 1);
        expect(out.length).toBeGreaterThan(0);
        expect(out.toLowerCase()).toContain('acme plumbing');
        expect(sentenceCount(out)).toBeGreaterThanOrEqual(2);
    });
});
