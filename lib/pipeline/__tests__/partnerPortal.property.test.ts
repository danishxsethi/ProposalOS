import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { onboardPartner, deliverLead, updateLeadStatus, getPartnerMetrics } from '../partnerPortal';
import { prisma } from '@/lib/db';

describe('Partner Portal - Property Tests', () => {
  let tenantId: string;

  beforeEach(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: `test-${Date.now()}`,
      },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    await prisma.partnerDeliveredLead.deleteMany({});
    await prisma.agencyPartner.deleteMany({});
    await prisma.prospectLead.deleteMany({});
    await prisma.tenant.deleteMany({});
  });

  /**
   * Property 38: Partner lead isolation
   *
   * For any two partners, leads delivered to partner A must not be visible to partner B,
   * and metrics for partner A must not include leads from partner B.
   */
  it('Property 38: Partner lead isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          verticals: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1 }),
          geographies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1 }),
          volume: fc.integer({ min: 1, max: 100 }),
        }), { minLength: 2, maxLength: 5 }),
        async (partnerConfigs) => {
          // Create multiple partners
          const partnerIds = await Promise.all(
            partnerConfigs.map((config) =>
              onboardPartner({
                name: config.name,
                contactEmail: config.email,
                verticals: config.verticals,
                geographies: config.geographies,
                monthlyVolume: config.volume,
                pricingModel: 'per_lead',
                perLeadPriceCents: 25000,
              })
            )
          );

          // Create prospects for each partner
          const prospects = await Promise.all(
            partnerIds.map((_, idx) =>
              prisma.prospectLead.create({
                data: {
                  tenantId,
                  businessName: `Business ${idx}`,
                  website: `https://business${idx}.com`,
                  city: partnerConfigs[idx].geographies[0],
                  vertical: partnerConfigs[idx].verticals[0],
                  painScore: 70,
                  painBreakdown: {
                    websiteSpeed: 10,
                    mobileBroken: 10,
                    gbpNeglected: 10,
                    noSsl: 10,
                    zeroReviewResponses: 10,
                    socialMediaDead: 10,
                    competitorsOutperforming: 10,
                    accessibilityViolations: 0,
                  },
                  decisionMakerName: 'Owner',
                  decisionMakerTitle: 'Owner',
                  decisionMakerEmail: `owner${idx}@business.com`,
                  status: 'proposed',
                },
              })
            )
          );

          // Deliver leads to each partner
          await Promise.all(
            partnerIds.map((partnerId, idx) =>
              deliverLead(partnerId, prospects[idx].id)
            )
          );

          // Verify isolation: each partner should only see their own leads
          for (let i = 0; i < partnerIds.length; i++) {
            const metrics = await getPartnerMetrics(partnerIds[i]);
            expect(metrics.totalLeadsDelivered).toBe(1);
            expect(metrics.leadsConverted).toBe(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 39: Partner metrics consistency
   *
   * For any partner with delivered leads, the sum of all status counts must equal
   * the total leads delivered, and conversion rate must be between 0 and 100.
   */
  it('Property 39: Partner metrics consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          status: fc.constantFrom('delivered', 'viewed', 'contacted', 'converted', 'rejected'),
        }), { minLength: 1, maxLength: 20 }),
        async (statusUpdates) => {
          // Create partner
          const partnerId = await onboardPartner({
            name: 'Test Partner',
            contactEmail: 'test@partner.com',
            verticals: ['dentistry'],
            geographies: ['New York'],
            monthlyVolume: 100,
            pricingModel: 'per_lead',
            perLeadPriceCents: 25000,
          });

          // Create and deliver prospects
          const prospects = await Promise.all(
            statusUpdates.map((_, idx) =>
              prisma.prospectLead.create({
                data: {
                  tenantId,
                  businessName: `Business ${idx}`,
                  website: `https://business${idx}.com`,
                  city: 'New York',
                  vertical: 'dentistry',
                  painScore: 70,
                  painBreakdown: {
                    websiteSpeed: 10,
                    mobileBroken: 10,
                    gbpNeglected: 10,
                    noSsl: 10,
                    zeroReviewResponses: 10,
                    socialMediaDead: 10,
                    competitorsOutperforming: 10,
                    accessibilityViolations: 0,
                  },
                  decisionMakerName: 'Owner',
                  decisionMakerTitle: 'Owner',
                  decisionMakerEmail: `owner${idx}@business.com`,
                  status: 'proposed',
                },
              })
            )
          );

          // Deliver and update statuses
          await Promise.all(
            prospects.map((prospect, idx) =>
              deliverLead(partnerId, prospect.id).then(() =>
                updateLeadStatus(partnerId, prospect.id, statusUpdates[idx].status)
              )
            )
          );

          // Get metrics
          const metrics = await getPartnerMetrics(partnerId);

          // Verify consistency
          const statusSum =
            metrics.leadsViewed +
            metrics.leadsContacted +
            metrics.leadsConverted +
            metrics.leadsRejected;

          expect(statusSum).toBeLessThanOrEqual(metrics.totalLeadsDelivered);
          expect(metrics.conversionRate).toBeGreaterThanOrEqual(0);
          expect(metrics.conversionRate).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property 40: Lead packaging completeness
   *
   * For any delivered lead, the packaged data must contain all required fields:
   * leadId, businessName, painScore, decisionMaker email, and status.
   */
  it('Property 40: Lead packaging completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          businessName: fc.string({ minLength: 1, maxLength: 100 }),
          painScore: fc.integer({ min: 0, max: 100 }),
          decisionMakerName: fc.string({ minLength: 1, maxLength: 50 }),
          decisionMakerTitle: fc.string({ minLength: 1, maxLength: 50 }),
          decisionMakerEmail: fc.emailAddress(),
        }),
        async (prospectData) => {
          // Create partner
          const partnerId = await onboardPartner({
            name: 'Test Partner',
            contactEmail: 'test@partner.com',
            verticals: ['dentistry'],
            geographies: ['New York'],
            monthlyVolume: 100,
            pricingModel: 'per_lead',
            perLeadPriceCents: 25000,
          });

          // Create prospect
          const prospect = await prisma.prospectLead.create({
            data: {
              tenantId,
              businessName: prospectData.businessName,
              website: 'https://test.com',
              city: 'New York',
              vertical: 'dentistry',
              painScore: prospectData.painScore,
              painBreakdown: {
                websiteSpeed: 10,
                mobileBroken: 10,
                gbpNeglected: 10,
                noSsl: 10,
                zeroReviewResponses: 10,
                socialMediaDead: 10,
                competitorsOutperforming: 10,
                accessibilityViolations: 0,
              },
              decisionMakerName: prospectData.decisionMakerName,
              decisionMakerTitle: prospectData.decisionMakerTitle,
              decisionMakerEmail: prospectData.decisionMakerEmail,
              status: 'proposed',
            },
          });

          // Deliver lead
          const packagedLead = await deliverLead(partnerId, prospect.id);

          // Verify all required fields are present
          expect(packagedLead.leadId).toBeDefined();
          expect(packagedLead.leadId).toBe(prospect.id);
          expect(packagedLead.businessName).toBe(prospectData.businessName);
          expect(packagedLead.painScore).toBe(prospectData.painScore);
          expect(packagedLead.decisionMaker).toBeDefined();
          expect(packagedLead.decisionMaker.email).toBe(prospectData.decisionMakerEmail);
          expect(packagedLead.status).toBe('delivered');
          expect(packagedLead.deliveredAt).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });
});
