import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '../route';
import { onboardPartner, deliverLead } from '@/lib/pipeline/partnerPortal';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';
import { cleanupDb } from '@/lib/__tests__/utils/cleanup';

describe('Partner Matching Cron', () => {
  let tenantId: string;
  let partnerId: string;

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
    partnerId = await onboardPartner({
      name: 'Test Partner',
      contactEmail: 'test@partner.com',
      verticals: ['dentistry', 'hvac'],
      geographies: ['New York', 'Los Angeles'],
      monthlyVolume: 50,
      pricingModel: 'per_lead',
      perLeadPriceCents: 25000,
    });
  });

  afterEach(async () => {
    await cleanupDb(prisma);
  });

  it('should require valid cron secret', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/partner-matching', {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-secret',
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should match and deliver leads to partners', async () => {
    // Create test prospects
    const prospects = await Promise.all([
      prisma.prospectLead.create({
        data: {
          tenantId,
          businessName: 'Dental Practice',
          website: 'https://dental.com',
          city: 'New York',
          vertical: 'dentistry',
          painScore: 75,
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
          decisionMakerName: 'Dr. Smith',
          decisionMakerTitle: 'Owner',
          decisionMakerEmail: 'dr.smith@dental.com',
          status: 'QUALIFIED',
          source: 'test',
          sourceExternalId: 'test-2',
        },
      }),
      prisma.prospectLead.create({
        data: {
          tenantId,
          businessName: 'HVAC Company',
          website: 'https://hvac.com',
          city: 'Los Angeles',
          vertical: 'hvac',
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
          decisionMakerName: 'John Doe',
          decisionMakerTitle: 'Owner',
          decisionMakerEmail: 'john@plumbing.com',
          status: 'QUALIFIED',
          source: 'test',
          sourceExternalId: 'test-3',
        },
      }),
    ]);

    const request = new NextRequest('http://localhost:3000/api/cron/partner-matching', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.totalMatched).toBeGreaterThan(0);
    expect(data.totalDelivered).toBeGreaterThan(0);
  });

  it('should handle errors gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/partner-matching', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.errors).toBeDefined();
  });

  it('should return metrics', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/partner-matching', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.totalMatched).toBeDefined();
    expect(data.totalDelivered).toBeDefined();
    expect(data.errors).toBeDefined();
    expect(data.duration).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });
});
