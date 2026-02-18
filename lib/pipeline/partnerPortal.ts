import { prisma } from '@/lib/db';
import { PainScoreBreakdown } from './types';

export interface PartnerConfig {
  name: string;
  contactEmail: string;
  contactName?: string;
  verticals: string[];
  geographies: string[];
  monthlyVolume: number;
  pricingModel: 'per_lead' | 'subscription';
  perLeadPriceCents?: number;
  subscriptionPriceCents?: number;
}

export interface PackagedLead {
  leadId: string;
  businessName: string;
  auditSummary: Record<string, unknown>;
  proposalSummary: Record<string, unknown>;
  painScore: number;
  painBreakdown: PainScoreBreakdown;
  decisionMaker: { name: string; title: string; email: string };
  deliveredAt: Date;
  status: 'delivered' | 'viewed' | 'contacted' | 'converted' | 'rejected';
}

export interface PartnerMetrics {
  partnerId: string;
  totalLeadsDelivered: number;
  leadsViewed: number;
  leadsContacted: number;
  leadsConverted: number;
  leadsRejected: number;
  conversionRate: number;
  monthlyRevenue: number;
}

export interface PartnerPortal {
  onboardPartner(config: PartnerConfig): Promise<string>;
  matchLeadsToPartner(partnerId: string): Promise<PackagedLead[]>;
  deliverLead(partnerId: string, leadId: string): Promise<PackagedLead>;
  updateLeadStatus(partnerId: string, leadId: string, status: string): Promise<void>;
  getPartnerMetrics(partnerId: string): Promise<PartnerMetrics>;
}

/**
 * Onboard a new agency partner with configuration
 */
export async function onboardPartner(config: PartnerConfig): Promise<string> {
  const partner = await prisma.agencyPartner.create({
    data: {
      name: config.name,
      contactEmail: config.contactEmail,
      contactName: config.contactName,
      verticals: config.verticals,
      geographies: config.geographies,
      monthlyVolume: config.monthlyVolume,
      pricingModel: config.pricingModel,
      perLeadPriceCents: config.perLeadPriceCents,
      subscriptionPriceCents: config.subscriptionPriceCents,
      isActive: true,
    },
  });

  return partner.id;
}

/**
 * Find leads matching a partner's preferences
 */
export async function matchLeadsToPartner(partnerId: string): Promise<PackagedLead[]> {
  const partner = await prisma.agencyPartner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  // Find prospects matching partner's verticals and geographies
  const matchingProspects = await prisma.prospectLead.findMany({
    where: {
      status: 'proposed', // Only deliver proposed prospects
      vertical: { in: partner.verticals as string[] },
      city: { in: partner.geographies as string[] },
      // Exclude already delivered leads
      NOT: {
        deliveredLeads: {
          some: { partnerId },
        },
      },
    },
    include: {
      audit: true,
      proposal: true,
    },
    take: partner.monthlyVolume,
  });

  // Package leads
  const packagedLeads: PackagedLead[] = matchingProspects.map((prospect) => ({
    leadId: prospect.id,
    businessName: prospect.businessName,
    auditSummary: prospect.audit?.summary || {},
    proposalSummary: prospect.proposal?.summary || {},
    painScore: prospect.painScore || 0,
    painBreakdown: prospect.painBreakdown as PainScoreBreakdown,
    decisionMaker: {
      name: prospect.decisionMakerName || 'Unknown',
      title: prospect.decisionMakerTitle || 'Unknown',
      email: prospect.decisionMakerEmail || '',
    },
    deliveredAt: new Date(),
    status: 'delivered',
  }));

  return packagedLeads;
}

/**
 * Deliver a specific lead to a partner
 */
export async function deliverLead(partnerId: string, leadId: string): Promise<PackagedLead> {
  const partner = await prisma.agencyPartner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const prospect = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    include: {
      audit: true,
      proposal: true,
    },
  });

  if (!prospect) {
    throw new Error(`Prospect not found: ${leadId}`);
  }

  // Package the lead
  const packagedData = {
    leadId: prospect.id,
    businessName: prospect.businessName,
    auditSummary: prospect.audit?.summary || {},
    proposalSummary: prospect.proposal?.summary || {},
    painScore: prospect.painScore || 0,
    painBreakdown: prospect.painBreakdown,
    decisionMaker: {
      name: prospect.decisionMakerName || 'Unknown',
      title: prospect.decisionMakerTitle || 'Unknown',
      email: prospect.decisionMakerEmail || '',
    },
  };

  // Record delivery
  await prisma.partnerDeliveredLead.create({
    data: {
      partnerId,
      leadId,
      packagedData,
      status: 'delivered',
    },
  });

  return {
    ...packagedData,
    deliveredAt: new Date(),
    status: 'delivered',
  };
}

/**
 * Update lead status from partner feedback
 */
export async function updateLeadStatus(
  partnerId: string,
  leadId: string,
  status: string
): Promise<void> {
  const validStatuses = ['delivered', 'viewed', 'contacted', 'converted', 'rejected'];

  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  await prisma.partnerDeliveredLead.updateMany({
    where: {
      partnerId,
      leadId,
    },
    data: {
      status,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get partner metrics
 */
export async function getPartnerMetrics(partnerId: string): Promise<PartnerMetrics> {
  const partner = await prisma.agencyPartner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }

  const deliveredLeads = await prisma.partnerDeliveredLead.findMany({
    where: { partnerId },
  });

  const totalDelivered = deliveredLeads.length;
  const viewed = deliveredLeads.filter((l) => l.status === 'viewed').length;
  const contacted = deliveredLeads.filter((l) => l.status === 'contacted').length;
  const converted = deliveredLeads.filter((l) => l.status === 'converted').length;
  const rejected = deliveredLeads.filter((l) => l.status === 'rejected').length;

  // Calculate revenue
  let monthlyRevenue = 0;
  if (partner.pricingModel === 'per_lead') {
    monthlyRevenue = (converted * (partner.perLeadPriceCents || 0)) / 100;
  } else {
    monthlyRevenue = (partner.subscriptionPriceCents || 0) / 100;
  }

  return {
    partnerId,
    totalLeadsDelivered: totalDelivered,
    leadsViewed: viewed,
    leadsContacted: contacted,
    leadsConverted: converted,
    leadsRejected: rejected,
    conversionRate: totalDelivered > 0 ? (converted / totalDelivered) * 100 : 0,
    monthlyRevenue,
  };
}
