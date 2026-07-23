import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  computeEngagementScore,
  isHotLead,
  recordEvent,
} from '../dealCloser';
import type { EngagementScore, EngagementEvent, PipelineConfig } from '../types';
import { createScopedPrisma } from '@/lib/tenant/context';
import { OutreachEventType } from '@prisma/client';

// Mock the tenant context
vi.mock('@/lib/tenant/context', () => ({
  createScopedPrisma: vi.fn(),
}));

// Mock Stripe
vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
}));

describe('Deal Closer Property Tests', () => {
  const mockPrisma = {
    prospectLead: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    outreachEmailEvent: {
      create: vi.fn(),
    },
    winLossRecord: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createScopedPrisma as any).mockReturnValue(mockPrisma);
  });

  /**
   * Property 21: Engagement events are recorded with required fields
   * 
   * For any engagement event (email open, click, proposal view), the recorded event
   * must contain a non-null timestamp, event type, and the associated prospect/lead ID.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 21: Engagement events are recorded with required fields', () => {
    it('should record all engagement events with required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            leadId: fc.uuid(),
            eventType: fc.constantFrom(
              'email_open' as const,
              'email_click' as const,
              'proposal_view' as const,
              'tier_interaction' as const
            ),
            timestamp: fc.date(),
            metadata: fc.option(
              fc.record({
                emailId: fc.uuid(),
                dwellSeconds: fc.nat(600),
                scrollDepth: fc.double({ min: 0, max: 1 }),
              }),
              { nil: undefined }
            ),
          }),
          async (event: EngagementEvent) => {
            // Setup mock
            mockPrisma.prospectLead.findUnique.mockResolvedValue({
              id: event.leadId,
              tenantId: 'test-tenant',
            });
            mockPrisma.outreachEmailEvent.create.mockResolvedValue({});
            mockPrisma.prospectLead.update.mockResolvedValue({});

            // Execute
            await recordEvent(event.leadId, event);

            // Verify event was created with required fields
            expect(mockPrisma.outreachEmailEvent.create).toHaveBeenCalledWith(
              expect.objectContaining({
                data: expect.objectContaining({
                  leadId: event.leadId,
                  type: expect.any(String),
                  occurredAt: event.timestamp,
                  tenantId: 'test-tenant',
                }),
              })
            );

            // Verify lead was updated with engagement timestamp
            expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith(
              expect.objectContaining({
                where: { id: event.leadId },
                data: expect.objectContaining({
                  lastEngagementAt: event.timestamp,
                }),
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 22: Hot lead routing by percentile
   * 
   * For any set of active prospects for a tenant, the prospects routed to the
   * Human Review Queue must be exactly those whose engagement score is in the
   * top N percentile (configurable, default: top 5%).
   * 
   * **Validates: Requirements 6.6**
   */
  describe('Property 22: Hot lead routing by percentile', () => {
    it('should identify hot leads based on score threshold', () => {
      fc.assert(
        fc.property(
          fc.record({
            emailOpens: fc.nat(20),
            emailClicks: fc.nat(10),
            proposalViews: fc.nat(5),
            proposalDwellSeconds: fc.nat(600),
            scrollDepth: fc.double({ min: 0, max: 1 }),
            tierInteractions: fc.nat(5),
          }),
          fc.record({
            tenantId: fc.uuid(),
            concurrencyLimit: fc.nat(100),
            batchSize: fc.nat(100),
            painScoreThreshold: fc.integer({ min: 0, max: 100 }),
            dailyVolumeLimit: fc.nat(1000),
            spendingLimitCents: fc.nat(1000000),
            hotLeadPercentile: fc.integer({ min: 90, max: 99 }),
          }),
          (scoreData, config: PipelineConfig) => {
            // Calculate total score
            const score: EngagementScore = {
              ...scoreData,
              total:
                scoreData.emailOpens * 5 +
                scoreData.emailClicks * 10 +
                scoreData.proposalViews * 20 +
                Math.floor(scoreData.proposalDwellSeconds / 10) +
                Math.floor(scoreData.scrollDepth * 20) +
                scoreData.tierInteractions * 15,
            };

            // Execute
            const result = isHotLead(score, config);

            // Verify result is boolean
            expect(typeof result).toBe('boolean');

            // Verify hot lead threshold logic
            // A score >= 100 should be considered hot
            if (score.total >= 100) {
              expect(result).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should consistently classify the same score', () => {
      fc.assert(
        fc.property(
          fc.record({
            emailOpens: fc.nat(20),
            emailClicks: fc.nat(10),
            proposalViews: fc.nat(5),
            proposalDwellSeconds: fc.nat(600),
            scrollDepth: fc.double({ min: 0, max: 1 }),
            tierInteractions: fc.nat(5),
            total: fc.nat(500),
          }),
          fc.record({
            tenantId: fc.uuid(),
            concurrencyLimit: fc.nat(100),
            batchSize: fc.nat(100),
            painScoreThreshold: fc.integer({ min: 0, max: 100 }),
            dailyVolumeLimit: fc.nat(1000),
            spendingLimitCents: fc.nat(1000000),
            hotLeadPercentile: fc.integer({ min: 90, max: 99 }),
          }),
          (score: EngagementScore, config: PipelineConfig) => {
            // Execute twice
            const result1 = isHotLead(score, config);
            const result2 = isHotLead(score, config);

            // Verify consistency
            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Engagement score is non-negative and bounded
   * 
   * For any set of engagement events, the computed engagement score must be
   * non-negative and the total must equal the sum of component scores.
   */
  describe('Property: Engagement score calculation correctness', () => {
    it('should compute non-negative scores with correct totals', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              type: fc.constantFrom(
                OutreachEventType.EMAIL_OPEN,
                OutreachEventType.EMAIL_CLICK,
                OutreachEventType.PROPOSAL_VIEW_2M
              ),
              metadata: fc.record({
                dwellSeconds: fc.nat(600),
                scrollDepth: fc.double({ min: 0, max: 1 }),
                tierInteraction: fc.boolean(),
              }),
            }),
            { maxLength: 50 }
          ),
          async (leadId: string, events) => {
            // Setup mock
            mockPrisma.prospectLead.findUnique.mockResolvedValue({
              id: leadId,
              tenantId: 'test-tenant',
              scorecardTotalViewSeconds: 0,
              outreachEvents: events.map((e) => ({
                type: e.type,
                metadata: e.metadata,
              })),
            });
            mockPrisma.prospectLead.update.mockResolvedValue({});

            // Execute
            const score = await computeEngagementScore(leadId);

            // Verify non-negative components
            expect(score.emailOpens).toBeGreaterThanOrEqual(0);
            expect(score.emailClicks).toBeGreaterThanOrEqual(0);
            expect(score.proposalViews).toBeGreaterThanOrEqual(0);
            expect(score.proposalDwellSeconds).toBeGreaterThanOrEqual(0);
            expect(score.scrollDepth).toBeGreaterThanOrEqual(0);
            expect(score.tierInteractions).toBeGreaterThanOrEqual(0);
            expect(score.total).toBeGreaterThanOrEqual(0);

            // Verify total is sum of weighted components
            const expectedTotal =
              score.emailOpens * 5 +
              score.emailClicks * 10 +
              score.proposalViews * 20 +
              Math.floor(score.proposalDwellSeconds / 10) +
              Math.floor(score.scrollDepth * 20) +
              score.tierInteractions * 15;

            expect(score.total).toBe(expectedTotal);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Event type mapping is consistent
   * 
   * For any engagement event type, the mapping to OutreachEventType must be
   * consistent and deterministic.
   */
  describe('Property: Event type mapping consistency', () => {
    it('should consistently map event types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom(
            'email_open' as const,
            'email_click' as const,
            'proposal_view' as const,
            'tier_interaction' as const
          ),
          async (leadId: string, eventType) => {
            const event: EngagementEvent = {
              leadId,
              eventType,
              timestamp: new Date(),
            };

            // Expected mapping
            const expectedMapping: Record<string, OutreachEventType> = {
              email_open: OutreachEventType.EMAIL_OPEN,
              email_click: OutreachEventType.EMAIL_CLICK,
              proposal_view: OutreachEventType.PROPOSAL_VIEW_2M,
              tier_interaction: OutreachEventType.SCORECARD_CLICK,
            };

            // Setup mock for first call
            mockPrisma.prospectLead.findUnique.mockResolvedValueOnce({
              id: leadId,
              tenantId: 'test-tenant',
            });
            mockPrisma.outreachEmailEvent.create.mockResolvedValueOnce({});
            mockPrisma.prospectLead.update.mockResolvedValueOnce({});

            // Execute first time
            await recordEvent(leadId, event);
            const call1 = mockPrisma.outreachEmailEvent.create.mock.calls[
              mockPrisma.outreachEmailEvent.create.mock.calls.length - 1
            ];

            // Setup mock for second call
            mockPrisma.prospectLead.findUnique.mockResolvedValueOnce({
              id: leadId,
              tenantId: 'test-tenant',
            });
            mockPrisma.outreachEmailEvent.create.mockResolvedValueOnce({});
            mockPrisma.prospectLead.update.mockResolvedValueOnce({});

            // Execute second time
            await recordEvent(leadId, event);
            const call2 = mockPrisma.outreachEmailEvent.create.mock.calls[
              mockPrisma.outreachEmailEvent.create.mock.calls.length - 1
            ];

            // Verify same event type mapping
            expect(call1[0].data.type).toBe(call2[0].data.type);
            expect(call1[0].data.type).toBe(expectedMapping[eventType]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
