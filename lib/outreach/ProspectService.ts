import { randomUUID } from 'crypto';
import { promises as dnsPromises } from 'dns';

import { OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

import { logger } from '@/lib/logger';
import { normalizeVertical } from '@/lib/outreach/sprint2/config';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

// Standard list of disposable email providers
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'yopmail.com',
  'dispostable.com',
  'throwawaymail.com',
  'getnada.com',
  'boun.cr',
  'guerrillamail.com',
  'sharklasers.com',
  '10minutemail.com',
  'trashmail.com',
]);

// Generic role-based prefixes as specified
const GENERIC_PREFIXES = new Set([
  'info',
  'contact',
  'hello',
  'support',
  'sales',
  'admin',
  'team',
  'office',
  'help',
  'enquiry',
  'enquiries',
  'billing',
  'noreply',
  'no-reply',
  'jobs',
  'careers',
]);

export interface IngestedProspectInput {
  domain: string;
  businessName: string;
  industry: string;
  contactEmail: string;
  source?: string;
  city?: string;
  state?: string;
  website?: string;
}

export class ProspectService {
  /**
   * Performs granular syntax, role-account, disposable, and MX record DNS validation.
   */
  public static async validateEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
    if (!email || typeof email !== 'string') {
      return { valid: false, reason: 'Empty or invalid email type' };
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Syntax Check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      return { valid: false, reason: 'Invalid email syntax' };
    }

    const [localPart, domain] = cleanEmail.split('@');
    if (!localPart || !domain) {
      return { valid: false, reason: 'Malformed email parts' };
    }

    // 2. Role-based prefix check
    if (GENERIC_PREFIXES.has(localPart)) {
      return { valid: false, reason: `Generic role-based email account (${localPart})` };
    }

    // 3. Disposable email domain check
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { valid: false, reason: `Disposable email domain rejected (${domain})` };
    }

    // 4. DNS MX lookup check (with mock bypass for test suites and offline modes)
    if (process.env.NODE_ENV === 'test' || process.env.BYPASS_DNS_CHECK === 'true') {
      return { valid: true };
    }

    try {
      const mxRecords = await dnsPromises.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, reason: 'No MX records found for domain' };
      }
    } catch (err) {
      return {
        valid: false,
        reason: `DNS MX lookup failed: ${(err as Error).message || String(err)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Ingest prospects programmatically or from CSV into the database.
   * Scoped securely per-tenant, ensuring deduplication, global blocklist validation,
   * RLS context conformance, and standard lead orchestration statuses.
   */
  public static async ingestProspects(
    tenantId: string,
    prospects: IngestedProspectInput[]
  ): Promise<{
    totalProcessed: number;
    insertedCount: number;
    failedValidationCount: number;
    suppressedCount: number;
    details: Array<{
      email: string;
      outcome: 'inserted' | 'failed' | 'suppressed';
      reason?: string;
    }>;
  }> {
    const outcomeResult = {
      totalProcessed: prospects.length,
      insertedCount: 0,
      failedValidationCount: 0,
      suppressedCount: 0,
      details: [] as Array<{
        email: string;
        outcome: 'inserted' | 'failed' | 'suppressed';
        reason?: string;
      }>,
    };

    if (prospects.length === 0) {
      return outcomeResult;
    }

    // Gather distinct emails for blocklist screening
    const emailsToCheck = Array.from(
      new Set(prospects.map((p) => p.contactEmail.trim().toLowerCase()).filter(Boolean))
    );

    // Query global EmailBlocklist (using runWithTenantBypass as blocklist is global/shared)
    const blocklistedSet = await runWithTenantBypass('ProspectService.checkBlocklist', async () => {
      const blocked = await prisma.emailBlocklist.findMany({
        where: { email: { in: emailsToCheck } },
        select: { email: true },
      });
      return new Set(blocked.map((b) => b.email.toLowerCase()));
    });

    // Execute under RLS Tenant context safely
    await runWithTenantAsync(tenantId, async () => {
      // Dedup within batch
      const seenEmailsInBatch = new Set<string>();

      for (const prospect of prospects) {
        const email = prospect.contactEmail?.trim().toLowerCase();
        if (!email) {
          outcomeResult.failedValidationCount++;
          outcomeResult.details.push({
            email: 'Unknown',
            outcome: 'failed',
            reason: 'Empty contact email',
          });
          continue;
        }

        // Check if we already processed this email in this batch
        if (seenEmailsInBatch.has(email)) {
          continue;
        }
        seenEmailsInBatch.add(email);

        // Check blocklist / suppression list
        if (blocklistedSet.has(email)) {
          outcomeResult.suppressedCount++;
          outcomeResult.details.push({
            email,
            outcome: 'suppressed',
            reason: 'Email is globally blocklisted/suppressed',
          });
          continue;
        }

        // Perform validation
        const valResult = await this.validateEmail(email);
        if (!valResult.valid) {
          outcomeResult.failedValidationCount++;
          outcomeResult.details.push({
            email,
            outcome: 'failed',
            reason: valResult.reason,
          });
          continue;
        }

        // Check if already exists in active leads for this tenant
        const existingLead = await prisma.prospectLead.findFirst({
          where: {
            tenantId,
            decisionMakerEmail: email,
          },
          select: { id: true },
        });

        if (existingLead) {
          outcomeResult.suppressedCount++;
          outcomeResult.details.push({
            email,
            outcome: 'suppressed',
            reason: 'Duplicate of an existing tenant lead',
          });
          continue;
        }

        // Normalize vertical & generate source fields
        const sourceName = prospect.source || 'csv_import';
        const normalizedVertical = normalizeVertical(prospect.industry || 'Unknown');

        // Create the ProspectLead record under current RLS-scoping
        await prisma.prospectLead.create({
          data: {
            tenantId,
            source: sourceName,
            sourceExternalId: `${sourceName}_${randomUUID()}`,
            sourceUrl: prospect.website || prospect.domain || null,
            businessName: prospect.businessName || 'Unknown Business',
            city: prospect.city || 'Unknown',
            state: prospect.state || null,
            vertical: normalizedVertical,
            website: prospect.website || prospect.domain || null,
            decisionMakerName: null,
            decisionMakerEmail: email,
            decisionMakerEmailStatus: 'verified',
            status: ProspectLeadStatus.DISCOVERED,
            pipelineStatus: 'discovered',
            outreachStage: OutreachLeadStage.READY,
          },
        });

        outcomeResult.insertedCount++;
        outcomeResult.details.push({
          email,
          outcome: 'inserted',
        });
      }
    });

    logger.info(
      {
        tenantId,
        processed: outcomeResult.totalProcessed,
        inserted: outcomeResult.insertedCount,
        failed: outcomeResult.failedValidationCount,
        suppressed: outcomeResult.suppressedCount,
      },
      'Prospect ingestion completed'
    );

    return outcomeResult;
  }
}
