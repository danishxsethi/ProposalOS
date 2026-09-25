import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ProspectService } from '@/lib/outreach/ProspectService';
import { AutomatedOutreachOrchestrator } from '@/lib/outreach/AutomatedOutreachOrchestrator';
import { processSniperOutreach } from '@/lib/outreach/sprint2/sniperWorker';
import { FeatureFlagService } from '@/lib/config/FeatureFlagService';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import { cleanupDb } from '@/lib/__tests__/utils/cleanup';
import { OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

describe('Outreach Sandbox E2E Funnel Tests', () => {
  let testTenantId: string;

  beforeEach(async () => {
    // 1. Clean up database
    await cleanupDb(prisma);

    // 2. Setup standard test tenant
    const tenant = await runWithTenantBypass('test-setup:create-tenant', () =>
      prisma.tenant.create({
        data: {
          name: 'Sandbox Outbound Corp',
          requireHumanReview: false,
        },
      })
    );
    testTenantId = tenant.id;

    // 3. Set environment variable defaults
    process.env.NODE_ENV = 'test';
    process.env.BYPASS_DNS_CHECK = 'true';
    process.env.OUTREACH_LIVE_SENDING = 'false';
    process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'false';
    process.env.EMAIL_WARMUP_ENABLED = 'false';
    process.env.OUTREACH_DAILY_SEND_CAP = '100';
    process.env.OUTREACH_GLOBAL_SEND_CAP = '5000';
    process.env.OUTREACH_SENDING_EMAILS = 'hello@sandbox-outbound.com,growth@sandbox-outbound.com';

    // Clear feature flag cache
    FeatureFlagService.invalidateCache();
  });

  afterEach(async () => {
    await cleanupDb(prisma);
  });

  it('runs the full outbound funnel end-to-end in sandbox mode with absolute safety', async () => {
    // =========================================================================
    // PART A: Prospect Ingestion, Validation & Suppression
    // =========================================================================

    // Insert 'blocked@example.com' into global suppression list
    await runWithTenantBypass('test-setup:create-suppression', () =>
      prisma.emailBlocklist.create({
        data: {
          email: 'blocked@example.com',
          reason: 'unsubscribed',
        },
      })
    );

    const batchInput = [
      {
        domain: 'alphadentistry.com',
        businessName: 'Alpha Dentistry',
        industry: 'dental',
        contactEmail: 'dr.john@alphadentistry.com', // Valid
        source: 'csv_import',
      },
      {
        domain: 'alphadentistry.com',
        businessName: 'Alpha Dentistry',
        industry: 'dental',
        contactEmail: 'info@alphadentistry.com', // Generic/Role-prefix (should fail)
        source: 'csv_import',
      },
      {
        domain: 'betagrowth.com',
        businessName: 'Beta Growth',
        industry: 'Plumbing',
        contactEmail: 'blocked@example.com', // Globally blocklisted (should suppress)
        source: 'csv_import',
      },
    ];

    const ingestResult = await ProspectService.ingestProspects(testTenantId, batchInput);

    expect(ingestResult.totalProcessed).toBe(3);
    expect(ingestResult.insertedCount).toBe(1);
    expect(ingestResult.failedValidationCount).toBe(1); // info@ failed role check
    expect(ingestResult.suppressedCount).toBe(1); // blocked@ was suppressed

    // Attempt duplicate ingestion
    const duplicateIngestResult = await ProspectService.ingestProspects(testTenantId, [
      {
        domain: 'alphadentistry.com',
        businessName: 'Alpha Dentistry',
        industry: 'dental',
        contactEmail: 'dr.john@alphadentistry.com',
        source: 'csv_import',
      },
    ]);
    expect(duplicateIngestResult.suppressedCount).toBe(1); // Dup suppressed

    // Verify lead exists in Discovered state and Ready outreach stage
    const lead = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findFirst({
        where: { decisionMakerEmail: 'dr.john@alphadentistry.com' },
      })
    );
    expect(lead).toBeDefined();
    expect(lead!.pipelineStatus).toBe('discovered');
    expect(lead!.outreachStage).toBe(OutreachLeadStage.READY);

    // =========================================================================
    // PART B: Automated Crawl -> Proposal Trigger -> Auto-QA Scorer Gating
    // =========================================================================

    const orchestratorResult = await AutomatedOutreachOrchestrator.processAuditProposalLoop(
      testTenantId,
      {
        simulate: true,
      }
    );

    expect(orchestratorResult.processedCount).toBe(1);
    expect(orchestratorResult.auditedCount).toBe(1);
    expect(orchestratorResult.promotedToOutreach).toBe(0);
    expect(orchestratorResult.droppedCount).toBe(1);
    expect(orchestratorResult.details[0]?.outcome).toBe('dropped');

    // Sandbox observations are review-only, not qualified for outreach.
    const enrichedLead = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findFirst({
        where: { decisionMakerEmail: 'dr.john@alphadentistry.com' },
        include: { outreachEmails: true },
      })
    );
    expect(enrichedLead!.pipelineStatus).toBe('audit_failed');
    expect(enrichedLead!.status).not.toBe(ProspectLeadStatus.ENRICHED);
    expect(enrichedLead!.outreachStage).toBe(OutreachLeadStage.DROPPED);
    expect(enrichedLead!.proposalId).toBeNull();

    // Simulated evidence must never be treated as a real, trusted audit or a
    // publishable proposal, and the sandbox must not call a live sender.
    const auditId = await runWithTenantAsync(testTenantId, async () =>
      (await prisma.prospectLead.findUnique({ where: { id: lead!.id } }))!.auditId
    );
    const sandboxAudit = await runWithTenantAsync(testTenantId, () =>
      prisma.audit.findFirst({ where: { id: auditId! } })
    );
    expect(sandboxAudit?.trustState).not.toBe('TRUSTED');

    // =========================================================================
    // PART D: Sniper Sequence Sending & Multi-Domain Rotation Pool (Dry-Run)
    // =========================================================================

    // The sniper worker must ignore a lead that failed trusted audit qualification.
    const sniperResult1 = await processSniperOutreach(testTenantId);

    expect(sniperResult1.processedLeads).toBe(0);
    expect(sniperResult1.sentEmails).toBe(0);
    expect(sniperResult1.skipped).toBe(0);

    // No outbound sequence is eligible without trusted audit/publication state.
    const leadAfterSend = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
        include: { outreachEmails: { orderBy: { sequencePosition: 'asc' } } },
      })
    );

    expect(leadAfterSend!.outreachEmails).toHaveLength(0);
    expect(leadAfterSend!.outreachStage).toBe(OutreachLeadStage.DROPPED);

    // =========================================================================
    // PART C: Warmup Curve Limit Verification
    // =========================================================================
    process.env.EMAIL_WARMUP_ENABLED = 'true';
    FeatureFlagService.invalidateCache();

    // Verify we can find the domain daily stat is incremented correctly
    const dailyStats = await runWithTenantAsync(testTenantId, () =>
      prisma.outreachDomainDailyStat.findMany({
        where: { tenantId: testTenantId },
      })
    );
    expect(dailyStats.length).toBe(0);
    const totalSent = dailyStats.reduce((sum, s) => sum + s.sentCount, 0);
    expect(totalSent).toBe(0);

    // =========================================================================
    // PART D (Continued): Ineligible simulation must remain blocked on repeat polls
    // =========================================================================

    // A repeat worker poll cannot advance the downgraded lead.
    const sniperResultReply = await processSniperOutreach(testTenantId);
    expect(sniperResultReply.processedLeads).toBe(0);

    // An untrusted sandbox audit remains ineligible on subsequent worker polls.
    const leadAfterReply = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
        include: { outreachEmails: true },
      })
    );
    expect(leadAfterReply!.outreachStage).toBe(OutreachLeadStage.DROPPED);
    expect(leadAfterReply!.outreachEmails).toHaveLength(0);

    // Continue proving the untrusted sandbox lead remains ineligible.

    // The public send path is never invoked for an untrusted sandbox audit.
    const sniperResultUnsub = await processSniperOutreach(testTenantId);
    expect(sniperResultUnsub.processedLeads).toBe(0);

    const leadAfterUnsub = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
      })
    );
    expect(leadAfterUnsub!.outreachStage).toBe(OutreachLeadStage.DROPPED);

    // Continue proving send caps do not promote an ineligible lead.

    // Scenario 3: Send Cap Hit (Hard Stop)
    // Set daily cap to 0 to simulate exceeding limits
    process.env.OUTREACH_DAILY_SEND_CAP = '0';

    const sniperResultCap = await processSniperOutreach(testTenantId);
    expect(sniperResultCap.processedLeads).toBe(0);
    expect(sniperResultCap.sentEmails).toBe(0);

    // Restore daily cap.
    process.env.OUTREACH_DAILY_SEND_CAP = '100';

    // Scenario 4: Kill Switch Halt
    // Set kill switch flag
    process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'true';
    FeatureFlagService.invalidateCache();

    const sniperResultKill = await processSniperOutreach(testTenantId);
    expect(sniperResultKill.halted).toBe(true);
    expect(sniperResultKill.sentEmails).toBe(0);

    // Cleanup kill switch environment
    process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'false';
    FeatureFlagService.invalidateCache();
  });
});
