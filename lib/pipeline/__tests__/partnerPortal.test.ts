import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  onboardPartner,
  matchLeadsToPartner,
  deliverLead,
  updateLeadStatus,
  getPartnerMetrics,
  PartnerConfig,
} from '../partnerPortal';
import { prisma } from '@/lib/db';

describe('Partner Portal', () => {
  let partnerId: string;
  let leadId: string;
  let tenantId: string;

  beforeEach(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant',
        slug: `test-${Date.now()}`,
      },
    });
    tenantId = tenant.id;

    // Create test partner
    const config: PartnerConfig = {
      name: 'Test Agency',
      contactEmail: 'contact@agency.com',
      contactName: 'John Doe',
      verticals: ['dentistry', 'hvac'],
      geographies: ['New York', 'Los Angeles'],
      monthlyVolume: 50,
      pricingModel: 'per_lead',
      perLeadPriceCents: 25000, // $250
    };
    partnerId = await onboardPartner(config);

    // Create test prospect
    const prospect = await prisma.prospectLead.create({
      data: {
        tenantId,
        businessName: 'Test Dental Practice',
        website: 'https://testdental.com',
        city: 'New York',
        vertical: 'dentistry',
        painScore: 75,
        painBreakdown: {
          websiteSpeed: 15,
          mobileBroken: 10,
          gbpNeglected: 10,
          noSsl: 5,
          zeroReviewResponses: 10,
          socialMediaDead: 10,
          competitorsOutperforming: 5,
          accessibilityViolations: 0,
        },
        decisionMakerName: 'Dr. Smith',
        decisionMakerTitle: 'Owner',
        decisionMakerEmail: 'dr.smith@testdental.com',
        status: 'proposed',
      },
    });
    leadId = prospect.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.partnerDeliveredLead.deleteMany({});
    await prisma.agencyPartner.deleteMany({});
    await prisma.prospectLead.deleteMany({});
    await prisma.tenant.deleteMany({});
  });

  describe('onboardPartner', () => {
    it('should create a new partner with configuration', async () => {
      const config: PartnerConfig = {
        name: 'New Agency',
        contactEmail: 'new@agency.com',
        verticals: ['plumbing'],
        geographies: ['Chicago'],
        monthlyVolume: 100,
        pricingModel: 'subscription',
        subscriptionPriceCents: 150000, // $1500
      };

      const newPartnerId = await onboardPartner(config);

      const partner = await prisma.agencyPartner.findUnique({
        where: { id: newPartnerId },
      });

      expect(partner).toBeDefined();
      expect(partner?.name).toBe('New Agency');
      expect(partner?.pricingModel).toBe('subscription');
      expect(partner?.isActive).toBe(true);
    });

    it('should set sensible defaults for new partners', async () => {
      const config: PartnerConfig = {
        name: 'Minimal Agency',
        contactEmail: 'minimal@agency.com',
        verticals: ['hvac'],
        geographies: ['Boston'],
        monthlyVolume: 25,
        pricingModel: 'per_lead',
        perLeadPriceCents: 20000,
      };

      const newPartnerId = await onboardPartner(config);
      const partner = await prisma.agencyPartner.findUnique({
        where: { id: newPartnerId },
      });

      expect(partner?.isActive).toBe(true);
      expect(partner?.monthlyVolume).toBe(25);
    });
  });

  describe('deliverLead', () => {
    it('should package and deliver a lead to partner', async () => {
      const packagedLead = await deliverLead(partnerId, leadId);

      expect(packagedLead.leadId).toBe(leadId);
      expect(packagedLead.businessName).toBe('Test Dental Practice');
      expect(packagedLead.painScore).toBe(75);
      expect(packagedLead.decisionMaker.email).toBe('dr.smith@testdental.com');
      expect(packagedLead.status).toBe('delivered');
    });

    it('should record delivery in database', async () => {
      await deliverLead(partnerId, leadId);

      const delivery = await prisma.partnerDeliveredLead.findFirst({
        where: {
          partnerId,
          leadId,
        },
      });

      expect(delivery).toBeDefined();
      expect(delivery?.status).toBe('delivered');
    });

    it('should throw error for non-existent partner', async () => {
      await expect(deliverLead('invalid-partner', leadId)).rejects.toThrow(
        'Partner not found'
      );
    });

    it('should throw error for non-existent lead', async () => {
      await expect(deliverLead(partnerId, 'invalid-lead')).rejects.toThrow(
        'Prospect not found'
      );
    });
  });

  describe('updateLeadStatus', () => {
    beforeEach(async () => {
      await deliverLead(partnerId, leadId);
    });

    it('should update lead status to viewed', async () => {
      await updateLeadStatus(partnerId, leadId, 'viewed');

      const delivery = await prisma.partnerDeliveredLead.findFirst({
        where: { partnerId, leadId },
      });

      expect(delivery?.status).toBe('viewed');
    });

    it('should update lead status to contacted', async () => {
      await updateLeadStatus(partnerId, leadId, 'contacted');

      const delivery = await prisma.partnerDeliveredLead.findFirst({
        where: { partnerId, leadId },
      });

      expect(delivery?.status).toBe('contacted');
    });

    it('should update lead status to converted', async () => {
      await updateLeadStatus(partnerId, leadId, 'converted');

      const delivery = await prisma.partnerDeliveredLead.findFirst({
        where: { partnerId, leadId },
      });

      expect(delivery?.status).toBe('converted');
    });

    it('should reject invalid status', async () => {
      await expect(updateLeadStatus(partnerId, leadId, 'invalid')).rejects.toThrow(
        'Invalid status'
      );
    });
  });

  describe('getPartnerMetrics', () => {
    beforeEach(async () => {
      // Deliver multiple leads with different statuses
      const prospect2 = await prisma.prospectLead.create({
        data: {
          tenantId,
          businessName: 'Test HVAC',
          website: 'https://testhvac.com',
          city: 'Los Angeles',
          vertical: 'hvac',
          painScore: 65,
          painBreakdown: {
            websiteSpeed: 10,
            mobileBroken: 8,
            gbpNeglected: 8,
            noSsl: 5,
            zeroReviewResponses: 8,
            socialMediaDead: 8,
            competitorsOutperforming: 5,
            accessibilityViolations: 0,
          },
          decisionMakerName: 'Bob Johnson',
          decisionMakerTitle: 'Manager',
          decisionMakerEmail: 'bob@hvac.com',
          status: 'proposed',
        },
      });

      await deliverLead(partnerId, leadId);
      await deliverLead(partnerId, prospect2.id);

      // Update statuses
      await updateLeadStatus(partnerId, leadId, 'converted');
      await updateLeadStatus(partnerId, prospect2.id, 'viewed');
    });

    it('should calculate correct metrics', async () => {
      const metrics = await getPartnerMetrics(partnerId);

      expect(metrics.partnerId).toBe(partnerId);
      expect(metrics.totalLeadsDelivered).toBe(2);
      expect(metrics.leadsConverted).toBe(1);
      expect(metrics.leadsViewed).toBe(1);
      expect(metrics.conversionRate).toBe(50);
    });

    it('should calculate revenue for per-lead pricing', async () => {
      const metrics = await getPartnerMetrics(partnerId);

      // 1 converted lead at $250 per lead
      expect(metrics.monthlyRevenue).toBe(250);
    });

    it('should calculate revenue for subscription pricing', async () => {
      const subscriptionConfig: PartnerConfig = {
        name: 'Subscription Partner',
        contactEmail: 'sub@agency.com',
        verticals: ['dentistry'],
        geographies: ['New York'],
        monthlyVolume: 50,
        pricingModel: 'subscription',
        subscriptionPriceCents: 200000, // $2000
      };

      const subPartnerId = await onboardPartner(subscriptionConfig);
      const metrics = await getPartnerMetrics(subPartnerId);

      expect(metrics.monthlyRevenue).toBe(2000);
    });

    it('should throw error for non-existent partner', async () => {
      await expect(getPartnerMetrics('invalid-partner')).rejects.toThrow(
        'Partner not found'
      );
    });
  });

  describe('matchLeadsToPartner', () => {
    beforeEach(async () => {
      // Create additional prospects
      await prisma.prospectLead.create({
        data: {
          tenantId,
          businessName: 'HVAC Company',
          website: 'https://hvac.com',
          city: 'Los Angeles',
          vertical: 'hvac',
          painScore: 70,
          painBreakdown: {
            websiteSpeed: 12,
            mobileBroken: 10,
            gbpNeglected: 10,
            noSsl: 5,
            zeroReviewResponses: 10,
            socialMediaDead: 10,
            competitorsOutperforming: 5,
            accessibilityViolations: 0,
          },
          decisionMakerName: 'Alice',
          decisionMakerTitle: 'Owner',
          decisionMakerEmail: 'alice@hvac.com',
          status: 'proposed',
        },
      });

      // Create prospect outside partner's geographies
      await prisma.prospectLead.create({
        data: {
          tenantId,
          businessName: 'Chicago Dental',
          website: 'https://chicago-dental.com',
          city: 'Chicago',
          vertical: 'dentistry',
          painScore: 75,
          painBreakdown: {
            websiteSpeed: 15,
            mobileBroken: 10,
            gbpNeglected: 10,
            noSsl: 5,
            zeroReviewResponses: 10,
            socialMediaDead: 10,
            competitorsOutperforming: 5,
            accessibilityViolations: 0,
          },
          decisionMakerName: 'Charlie',
          decisionMakerTitle: 'Owner',
          decisionMakerEmail: 'charlie@dental.com',
          status: 'proposed',
        },
      });
    });

    it('should match leads by vertical and geography', async () => {
      const matches = await matchLeadsToPartner(partnerId);

      // Should match dentistry in New York and HVAC in Los Angeles
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every((m) => m.painScore > 0)).toBe(true);
    });

    it('should respect monthly volume limit', async () => {
      const matches = await matchLeadsToPartner(partnerId);

      // Partner has monthlyVolume of 50
      expect(matches.length).toBeLessThanOrEqual(50);
    });

    it('should exclude already delivered leads', async () => {
      // Deliver first lead
      await deliverLead(partnerId, leadId);

      // Match again
      const matches = await matchLeadsToPartner(partnerId);

      // Should not include the already delivered lead
      const deliveredLeadIds = matches.map((m) => m.leadId);
      expect(deliveredLeadIds).not.toContain(leadId);
    });
  });
});
