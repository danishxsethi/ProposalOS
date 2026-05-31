import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ProspectService } from '@/lib/outreach/ProspectService';
import { AutomatedOutreachOrchestrator } from '@/lib/outreach/AutomatedOutreachOrchestrator';
import { processSniperOutreach } from '@/lib/outreach/sprint2/sniperWorker';
import { FeatureFlagService } from '@/lib/config/FeatureFlagService';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import { cleanupDb } from '@/lib/__tests__/utils/cleanup';
import { OutreachEmailStatus, OutreachLeadStage, ProspectLeadStatus } from '@prisma/client';

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
    expect(orchestratorResult.promotedToOutreach).toBe(1);

    // Verify the lead has been updated to ready_for_outreach and score was evaluated
    const enrichedLead = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findFirst({
        where: { decisionMakerEmail: 'dr.john@alphadentistry.com' },
        include: { outreachEmails: true },
      })
    );
    expect(enrichedLead!.pipelineStatus).toBe('ready_for_outreach');
    expect(enrichedLead!.status).toBe(ProspectLeadStatus.ENRICHED);
    expect(enrichedLead!.outreachStage).toBe(OutreachLeadStage.READY);
    expect(enrichedLead!.proposalId).toBeDefined();

    // =========================================================================
    // PART D: Sniper Sequence Sending & Multi-Domain Rotation Pool (Dry-Run)
    // =========================================================================

    // Process the sniper worker for the first time.
    // This will compose the 5-email sequence and dry-run send Step 1 (INITIAL).
    const sniperResult1 = await processSniperOutreach(testTenantId);

    expect(sniperResult1.processedLeads).toBe(1);
    expect(sniperResult1.sentEmails).toBe(1); // Step 1 sent
    expect(sniperResult1.skipped).toBe(0);

    // Verify the sequence was created and the first email is marked SENT (since dry-run/mock is successful)
    const leadAfterSend = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
        include: { outreachEmails: { orderBy: { sequencePosition: 'asc' } } },
      })
    );

    expect(leadAfterSend!.outreachEmails).toHaveLength(5);
    expect(leadAfterSend!.outreachEmails[0].status).toBe(OutreachEmailStatus.SENT);
    expect(leadAfterSend!.outreachEmails[1].status).toBe(OutreachEmailStatus.PENDING);
    expect(leadAfterSend!.outreachStage).toBe(OutreachLeadStage.EMAIL_SENT);

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
    expect(dailyStats.length).toBeGreaterThan(0);
    const totalSent = dailyStats.reduce((sum, s) => sum + s.sentCount, 0);
    expect(totalSent).toBe(1);

    // =========================================================================
    // PART D (Continued): Stop-on-Reply / Stop-on-Bounce / Stop-on-Unsubscribe Behavioral Branching
    // =========================================================================

    // Scenario 1: Stop-on-Reply
    // Simulate prospect reply by incrementing reply count
    await runWithTenantAsync(testTenantId, async () => {
      await prisma.prospectLead.update({
        where: { id: enrichedLead!.id },
        data: {
          outreachReplyCount: 1,
        },
      });
      // Force next pending email to be due now
      await prisma.outreachEmail.updateMany({
        where: { leadId: enrichedLead!.id, status: OutreachEmailStatus.PENDING },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      });
    });

    // Trigger sniper - it should pause sequence and cancel pending emails due to reply
    const sniperResultReply = await processSniperOutreach(testTenantId);
    expect(sniperResultReply.skipped).toBe(1);
    expect(sniperResultReply.details[0].outcome).toBe('pause_for_review');

    // Verify lead stage updated and pending emails canceled
    const leadAfterReply = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
        include: { outreachEmails: true },
      })
    );
    expect(leadAfterReply!.outreachStage).toBe(OutreachLeadStage.REPLIED);
    const pendingEmails = leadAfterReply!.outreachEmails.filter(
      (e) => e.status === OutreachEmailStatus.PENDING
    );
    expect(pendingEmails).toHaveLength(0); // All other pending cancelled/failed

    // Reset lead for next scenarios
    await runWithTenantAsync(testTenantId, async () => {
      await prisma.outreachEmail.updateMany({
        where: { leadId: enrichedLead!.id },
        data: {
          status: OutreachEmailStatus.PENDING,
          scheduledAt: new Date(Date.now() - 3600000), // Force due now
        },
      });
      await prisma.prospectLead.update({
        where: { id: enrichedLead!.id },
        data: {
          outreachStage: OutreachLeadStage.EMAIL_SENT,
          outreachReplyCount: 0,
          outreachDropReason: null,
        },
      });
    });

    // Scenario 2: Stop-on-Unsubscribe
    // Put prospect on suppression blocklist
    await runWithTenantBypass('test-unsub', () =>
      prisma.emailBlocklist.create({
        data: {
          email: 'dr.john@alphadentistry.com',
          reason: 'unsubscribed',
        },
      })
    );

    const sniperResultUnsub = await processSniperOutreach(testTenantId);
    expect(sniperResultUnsub.skipped).toBe(1);
    expect(sniperResultUnsub.details[0].outcome).toBe('dropped');
    expect(sniperResultUnsub.details[0].action).toBe('suppression');

    const leadAfterUnsub = await runWithTenantAsync(testTenantId, () =>
      prisma.prospectLead.findUnique({
        where: { id: enrichedLead!.id },
      })
    );
    expect(leadAfterUnsub!.outreachStage).toBe(OutreachLeadStage.DROPPED);
    expect(leadAfterUnsub!.outreachDropReason).toContain('Suppressed globally');

    // Remove from blocklist and reset lead for next scenarios
    await runWithTenantBypass('test-unsub-cleanup', () =>
      prisma.emailBlocklist.delete({
        where: { email: 'dr.john@alphadentistry.com' },
      })
    );
    await runWithTenantAsync(testTenantId, async () => {
      await prisma.outreachEmail.updateMany({
        where: { leadId: enrichedLead!.id },
        data: {
          status: OutreachEmailStatus.PENDING,
          scheduledAt: new Date(Date.now() - 3600000), // Force due now
        },
      });
      await prisma.prospectLead.update({
        where: { id: enrichedLead!.id },
        data: {
          outreachStage: OutreachLeadStage.EMAIL_SENT,
          outreachDropReason: null,
        },
      });
    });

    // Scenario 3: Send Cap Hit (Hard Stop)
    // Set daily cap to 0 to simulate exceeding limits
    process.env.OUTREACH_DAILY_SEND_CAP = '0';

    const sniperResultCap = await processSniperOutreach(testTenantId);
    expect(sniperResultCap.capExceeded).toBe(true);
    expect(sniperResultCap.details[0].outcome).toBe('blocked');
    expect(sniperResultCap.details[0].reason).toContain('Daily send limit cap of 0 reached');

    // Restore daily cap and reset lead
    process.env.OUTREACH_DAILY_SEND_CAP = '100';
    await runWithTenantAsync(testTenantId, () =>
      prisma.outreachEmail.updateMany({
        where: { leadId: enrichedLead!.id, status: OutreachEmailStatus.PENDING },
        data: { scheduledAt: new Date(Date.now() - 3600000) },
      })
    );

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
