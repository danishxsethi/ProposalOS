import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEnrichmentWaterfall, EnrichmentLeadInput } from '@/lib/outreach/sprint2/enrichment';
import { logger } from '@/lib/logger';

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('sprint2 Enrichment Waterfall', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubGlobal('fetch', fetchMock);

        process.env.APOLLO_API_KEY = 'test_apollo_key';
        process.env.HUNTER_API_KEY = 'test_hunter_key';
        process.env.PROXYCURL_API_KEY = 'test_proxycurl_key';
        process.env.CLEARBIT_API_KEY = 'test_clearbit_key';
    });

    const lead: EnrichmentLeadInput = {
        businessName: 'Acme Corp',
        website: 'https://acme.com',
    };

    it('rejects generic info@ email and continues waterfall', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    people: [{ name: 'Info Team', email: 'info@acme.com' }],
                }),
            }) // Apollo returns generic
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: { emails: [{ value: 'john@acme.com', first_name: 'John', last_name: 'Doe' }] },
                }),
            }); // Hunter returns valid

        const result = await runEnrichmentWaterfall(lead);

        expect(result.contact?.email).toBe('john@acme.com');
        expect(result.status).toBe('SUCCESS');
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'info@acme.com' }),
            'Rejected generic email address from provider'
        );
    });

    it('passes through specific decision maker john@example.com', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                people: [{ name: 'John Doe', email: 'john@acme.com' }],
            }),
        }); // Apollo returns valid

        const result = await runEnrichmentWaterfall(lead);

        expect(result.contact?.email).toBe('john@acme.com');
        expect(result.status).toBe('SUCCESS');
        // Ensure the warning wasn't called for John
        expect(logger.info).not.toHaveBeenCalledWith(
            expect.objectContaining({ email: 'john@acme.com' }),
            'Rejected generic email address from provider'
        );
    });

    it('marks as no_decision_maker if all providers return generic emails', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    people: [{ name: 'Info', email: 'info@acme.com' }],
                }),
            }) // Apollo
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: { emails: [{ value: 'sales@acme.com' }] },
                }),
            }) // Hunter
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    employees: [{ full_name: 'Contact', work_email: 'contact@acme.com' }],
                }),
            }) // Proxycurl
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    person: { email: 'support@acme.com' },
                }),
            }); // Clearbit

        const result = await runEnrichmentWaterfall(lead);

        expect(result.contact?.email).toBeNull(); // or null based on your handling, it's stripped
        expect(result.status).toBe('no_decision_maker');
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ businessName: lead.businessName }),
            'All email candidates were generic, marked as no_decision_maker'
        );
    });
});
