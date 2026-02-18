/**
 * Signal Detector
 * 
 * Monitors external signals indicating optimal outreach timing:
 * - bad_review: New negative Google reviews (≤3 stars)
 * - website_change: Website changes detected via periodic re-crawl
 * - competitor_upgrade: Competitor website or GBP upgrades
 * - new_business_license: New business license filings
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import { prisma } from '@/lib/db';
import type { SignalType, DetectedSignal } from './types';

/**
 * Signal detection schedule (cron expressions)
 */
const SIGNAL_SCHEDULE: Record<SignalType, string> = {
  bad_review: '0 */6 * * *',           // Every 6 hours
  website_change: '0 2 * * *',         // Daily at 2 AM
  competitor_upgrade: '0 3 * * *',     // Daily at 3 AM
  new_business_license: '0 4 * * 1',   // Weekly on Monday at 4 AM
  hiring_spike: '0 5 * * 1',           // Weekly on Monday at 5 AM
};

/**
 * Deduplication window in hours
 */
const DEDUPLICATION_WINDOW_HOURS = 24;

/**
 * Run signal detection for a specific signal type
 * 
 * @param tenantId - Tenant ID to run detection for
 * @param signalType - Type of signal to detect
 * @returns Array of detected signals
 */
export async function runDetection(
  tenantId: string,
  signalType: SignalType
): Promise<DetectedSignal[]> {
  switch (signalType) {
    case 'bad_review':
      return detectBadReviews(tenantId);
    case 'website_change':
      return detectWebsiteChanges(tenantId);
    case 'competitor_upgrade':
      return detectCompetitorUpgrades(tenantId);
    case 'new_business_license':
      return detectNewBusinessLicenses(tenantId);
    case 'hiring_spike':
      return detectHiringSpikes(tenantId);
    default:
      throw new Error(`Unknown signal type: ${signalType}`);
  }
}

/**
 * Detect bad reviews (≤3 stars) for prospects
 */
async function detectBadReviews(tenantId: string): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  
  // Query prospects with GBP data
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      status: { in: ['discovered', 'audited', 'proposed'] },
      gbpPlaceId: { not: null },
    },
    select: {
      id: true,
      businessName: true,
      gbpPlaceId: true,
    },
  });

  // For each prospect, check for new bad reviews
  // In a real implementation, this would query Google Places API
  // For now, we'll simulate detection
  for (const prospect of prospects) {
    // Simulate: 10% chance of detecting a bad review
    if (Math.random() < 0.1) {
      const signal: DetectedSignal = {
        id: crypto.randomUUID(),
        leadId: prospect.id,
        signalType: 'bad_review',
        sourceData: {
          reviewRating: Math.floor(Math.random() * 3) + 1, // 1-3 stars
          reviewText: 'Simulated bad review text',
          reviewDate: new Date().toISOString(),
          reviewerName: 'Anonymous',
        },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Detect website changes via periodic re-crawl comparison
 */
async function detectWebsiteChanges(tenantId: string): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  
  // Query prospects with website URLs
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      status: { in: ['discovered', 'audited', 'proposed'] },
      websiteUrl: { not: null },
    },
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
    },
  });

  // For each prospect, check for website changes
  // In a real implementation, this would compare current crawl with previous
  // For now, we'll simulate detection
  for (const prospect of prospects) {
    // Simulate: 5% chance of detecting a website change
    if (Math.random() < 0.05) {
      const signal: DetectedSignal = {
        id: crypto.randomUUID(),
        leadId: prospect.id,
        signalType: 'website_change',
        sourceData: {
          changeType: 'redesign',
          changedPages: ['/home', '/about'],
          detectedDate: new Date().toISOString(),
        },
        detectedAt: new Date(),
        priority: 'medium',
        outreachTriggered: false,
      };
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Detect competitor website or GBP upgrades
 */
async function detectCompetitorUpgrades(tenantId: string): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  
  // Query prospects with competitor data
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      status: { in: ['discovered', 'audited', 'proposed'] },
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      industry: true,
    },
  });

  // For each prospect, check for competitor upgrades
  // In a real implementation, this would track competitor changes
  // For now, we'll simulate detection
  for (const prospect of prospects) {
    // Simulate: 3% chance of detecting a competitor upgrade
    if (Math.random() < 0.03) {
      const signal: DetectedSignal = {
        id: crypto.randomUUID(),
        leadId: prospect.id,
        signalType: 'competitor_upgrade',
        sourceData: {
          competitorName: 'Top Competitor Inc',
          upgradeType: 'website_redesign',
          detectedDate: new Date().toISOString(),
        },
        detectedAt: new Date(),
        priority: 'high',
        outreachTriggered: false,
      };
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Detect new business license filings in target geographies
 */
async function detectNewBusinessLicenses(tenantId: string): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  
  // Query tenant's target cities and verticals
  const config = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });

  if (!config) {
    return signals;
  }

  // In a real implementation, this would query business license databases
  // For now, we'll simulate detection
  // Simulate: 2 new business licenses per run
  for (let i = 0; i < 2; i++) {
    const signal: DetectedSignal = {
      id: crypto.randomUUID(),
      leadId: undefined, // No lead yet, this is a new business
      signalType: 'new_business_license',
      sourceData: {
        businessName: `New Business ${i + 1}`,
        licenseType: 'General Business',
        filingDate: new Date().toISOString(),
        city: 'San Francisco',
        state: 'CA',
      },
      detectedAt: new Date(),
      priority: 'high',
      outreachTriggered: false,
    };
    signals.push(signal);
  }

  return signals;
}

/**
 * Detect hiring spikes (job postings)
 */
async function detectHiringSpikes(tenantId: string): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  
  // Query prospects
  const prospects = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      status: { in: ['discovered', 'audited', 'proposed'] },
    },
    select: {
      id: true,
      businessName: true,
    },
  });

  // For each prospect, check for hiring spikes
  // In a real implementation, this would query job boards
  // For now, we'll simulate detection
  for (const prospect of prospects) {
    // Simulate: 2% chance of detecting a hiring spike
    if (Math.random() < 0.02) {
      const signal: DetectedSignal = {
        id: crypto.randomUUID(),
        leadId: prospect.id,
        signalType: 'hiring_spike',
        sourceData: {
          jobPostings: 5,
          roles: ['Marketing Manager', 'Sales Rep'],
          detectedDate: new Date().toISOString(),
        },
        detectedAt: new Date(),
        priority: 'medium',
        outreachTriggered: false,
      };
      signals.push(signal);
    }
  }

  return signals;
}

/**
 * Deduplicate signals to prevent duplicate outreach
 * 
 * Deduplicates by: tenantId + leadId + signalType + detectedAt window
 * 
 * @param signals - Array of detected signals
 * @returns Deduplicated array of signals
 */
export function deduplicateSignals(signals: DetectedSignal[]): DetectedSignal[] {
  const deduped: DetectedSignal[] = [];
  const seen = new Set<string>();

  for (const signal of signals) {
    // Create deduplication key
    const key = `${signal.leadId || 'new'}_${signal.signalType}_${Math.floor(
      signal.detectedAt.getTime() / (DEDUPLICATION_WINDOW_HOURS * 60 * 60 * 1000)
    )}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(signal);
    }
  }

  return deduped;
}

/**
 * Trigger signal-specific outreach that references the event
 * 
 * @param signal - Detected signal to trigger outreach for
 */
export async function triggerSignalOutreach(signal: DetectedSignal): Promise<void> {
  // Persist the signal to the database
  await prisma.detectedSignal.create({
    data: {
      tenantId: signal.leadId
        ? (await prisma.prospectLead.findUnique({
            where: { id: signal.leadId },
            select: { tenantId: true },
          }))?.tenantId || ''
        : '',
      leadId: signal.leadId,
      signalType: signal.signalType,
      priority: signal.priority,
      sourceData: signal.sourceData,
      outreachTriggered: false,
      detectedAt: signal.detectedAt,
    },
  });

  // Generate signal-specific outreach email
  const emailBody = generateSignalEmail(signal);

  // In a real implementation, this would:
  // 1. Create an outreach email record
  // 2. Queue it for sending via the outreach agent
  // 3. Mark the signal as outreachTriggered
  
  // For now, we'll just mark it as triggered
  await prisma.detectedSignal.updateMany({
    where: {
      leadId: signal.leadId,
      signalType: signal.signalType,
      detectedAt: signal.detectedAt,
    },
    data: {
      outreachTriggered: true,
    },
  });
}

/**
 * Generate signal-specific email content
 */
function generateSignalEmail(signal: DetectedSignal): string {
  switch (signal.signalType) {
    case 'bad_review':
      return `We noticed a recent ${signal.sourceData.reviewRating}-star review on your Google listing. This is an opportunity to turn things around and improve your online reputation...`;
    
    case 'website_change':
      return `We noticed you recently updated your website. That's great! We wanted to reach out because we found some areas that could still use improvement...`;
    
    case 'competitor_upgrade':
      return `We noticed that ${signal.sourceData.competitorName} recently upgraded their online presence. Don't let them get ahead - here's how you can stay competitive...`;
    
    case 'new_business_license':
      return `Congratulations on your new business! We help businesses like yours get off to a strong start with a professional online presence...`;
    
    case 'hiring_spike':
      return `We noticed you're hiring! That's exciting. As you grow, it's important to make sure your online presence can keep up...`;
    
    default:
      return 'We noticed some changes in your business and wanted to reach out...';
  }
}

/**
 * Get signal detection schedule
 * 
 * @returns Map of signal types to cron expressions
 */
export function getSchedule(): Record<SignalType, string> {
  return SIGNAL_SCHEDULE;
}

/**
 * Check if a signal already exists (for deduplication at DB level)
 */
export async function signalExists(
  tenantId: string,
  leadId: string | undefined,
  signalType: SignalType,
  windowHours: number = DEDUPLICATION_WINDOW_HOURS
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const existing = await prisma.detectedSignal.findFirst({
    where: {
      tenantId,
      leadId: leadId || null,
      signalType,
      detectedAt: { gte: windowStart },
    },
  });

  return existing !== null;
}
