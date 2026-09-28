// @vitest-environment node
/**
 * tests/reliability/outbound-kill-switch-provider-failure.test.ts
 *
 * Stream D — S7 (kill switch / sandbox) and S8 (email provider failure).
 *
 * REAL PostgreSQL (disposable per-file DB). Fixture tenant, lead, sending
 * domain, pending outreach email, audit and proposal rows are real; the
 * sniper worker (lib/outreach/sprint2/sniperWorker.ts) and the proposal
 * outbound path (lib/outreach/outboundDelivery.ts) run their production code
 * against those rows.
 *
 * Mock boundary (external to the kill-switch / delivery state machine):
 *   - lib/outreach/providers: getSendProvider() returns a spy; the REAL
 *     assertLiveProviderReady / outreachSendingEnabled env gates are kept.
 *   - lib/audit/dispatch, lib/proposal/runner: heavy side paths the sniper can
 *     reach for FOLLOWUP_PROPOSAL leads only (not exercised here).
 *   - lib/proposal/publicAccess.resolvePublicProposalAccess: the publication
 *     trust gate (evidence provenance / grounding fingerprint). Building a fully
 *     publishable proposal fixture is out of scope for a delivery-state test;
 *     the stub reads the REAL proposal row and returns its identity so tenant /
 *     recipient checks in outboundDelivery.ts still run against the DB.
 *
 * Covers:
 *   S7a  OUTREACH_LIVE_SENDING unset (no env, no FeatureFlag row) → sniper runs the
 *        sandbox mock transport: provider spy called 0×, providerMessageId
 *        'mock_*', event metadata isMock:true.
 *   S7b  OUTREACH_LIVE_SENDING='false' explicitly → same as S7a.
 *   S7c  Flag drift: FeatureFlag row says OUTREACH_LIVE_SENDING=true but the
 *        env gate OUTBOUND_DELIVERY_ENABLED is unset → assertLiveProviderReady
 *        refuses; provider spy 0×; email FAILED (never SENT with a real id).
 *   S7d  deliverProposalEmail: mode 'disabled' → FAILED (no DB touch); sandbox →
 *        SIMULATED; explicit mode:'live' with env gates off → throws before any
 *        provider call; proposal never SENT.
 *   S7e  KILL_SWITCH_FORCE_MANUAL_MODE halts the sniper before any lead is read.
 *   S8a  Live forced on (both env gates true) and provider.send throws → the
 *        outreach email row is FAILED with the provider error; lead not advanced;
 *        no EMAIL_SENT event.
 *   S8b  Live forced on and provider.send throws inside deliverProposalEmail →
 *        ProposalOutreach row carries UNKNOWN_PROVIDER_OUTCOME, proposal status
 *        unchanged (not SENT), error propagates, and a retry is blocked (QUEUED
 *        for reconciliation) rather than resent.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { activateRealDb, type RealDbSession } from '../helpers/realDb';

const session: RealDbSession = await activateRealDb('reliability_outbound');

const providerSpy = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('@/lib/outreach/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreach/providers')>();
  return {
    ...actual,
    getSendProvider: () => ({ name: 'resend' as const, send: providerSpy.send }),
  };
});
vi.mock('@/lib/audit/dispatch', () => ({ dispatchAuditExecution: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/proposal/runner', () => ({ generateProposal: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/proposal/publicAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proposal/publicAccess')>();
  const { prisma } = await import('@/lib/prisma');
  const { runWithTenantBypass } = await import('@/lib/tenant/context');
  return {
    ...actual,
    resolvePublicProposalAccess: async (token: string) => {
      const row = await runWithTenantBypass('test-fixture:public-access-stub', () =>
        prisma.proposal.findUnique({
          where: { webLinkToken: token },
          select: { id: true, tenantId: true, status: true, prospectEmail: true },
        })
      );
      if (!row) throw new actual.PublicProposalAccessError('Proposal not found', 404);
      return {
        proposalId: row.id,
        tenantId: row.tenantId,
        status: row.status,
        replyReceivedAt: null,
        outcome: null,
        tierChosen: null,
        proposal: { prospectEmail: row.prospectEmail } as never,
      };
    },
  };
});

const { processSniperOutreach } = await import('@/lib/outreach/sprint2/sniperWorker');
const { deliverProposalEmail, outboundMode } = await import('@/lib/outreach/outboundDelivery');
const { FeatureFlagService } = await import('@/lib/config/FeatureFlagService');
const { prisma } = await import('@/lib/prisma');
const { runWithTenantAsync, runWithTenantBypass } = await import('@/lib/tenant/context');

const ENV_KEYS = [
  'OUTREACH_LIVE_SENDING',
  'OUTBOUND_DELIVERY_ENABLED',
  'OUTBOUND_MODE',
  'KILL_SWITCH_FORCE_MANUAL_MODE',
  'EMAIL_WARMUP_ENABLED',
  'OUTREACH_SENDING_EMAILS',
  'OUTREACH_DAILY_SEND_CAP',
  'OUTREACH_GLOBAL_SEND_CAP',
  'BYPASS_DNS_CHECK',
  'NODE_ENV',
  'RESEND_API_KEY',
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

describe('Stream D — S7/S8 outbound kill switch & provider failure (real PostgreSQL)', () => {
  let tenantId: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    await runWithTenantBypass('test-fixture:create-tenant', () =>
      prisma.tenant.create({
        data: { id: tenantId, name: 'Outbound Reliability Tenant', slug: `ob-${tenantId}`, requireHumanReview: false },
      })
    );
  });

  afterAll(async () => {
    await session.cleanup();
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    // Baseline: every live gate OFF / unset.
    delete process.env.OUTREACH_LIVE_SENDING;
    delete process.env.OUTBOUND_DELIVERY_ENABLED;
    delete process.env.OUTBOUND_MODE;
    delete process.env.KILL_SWITCH_FORCE_MANUAL_MODE;
    process.env.EMAIL_WARMUP_ENABLED = 'false';
    process.env.BYPASS_DNS_CHECK = 'true';
    process.env.OUTREACH_DAILY_SEND_CAP = '100';
    process.env.OUTREACH_GLOBAL_SEND_CAP = '5000';
    process.env.OUTREACH_SENDING_EMAILS = 'hello@reliability-fixture.test';
    process.env.RESEND_API_KEY = 're_fixture_never_used';
    FeatureFlagService.invalidateCache();
    providerSpy.send.mockReset();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    FeatureFlagService.invalidateCache();
    await runWithTenantBypass('test-fixture:clear-flags', () =>
      prisma.featureFlag.deleteMany({ where: { key: 'OUTREACH_LIVE_SENDING' } })
    );
    // Each test owns its own lead; retire any email a test intentionally left
    // PENDING (e.g. the kill-switch halt) so later ticks only see their own fixture.
    await runWithTenantBypass('test-fixture:retire-pending', () =>
      prisma.outreachEmail.updateMany({
        where: { tenantId, status: 'PENDING' },
        data: { status: 'FAILED', errorMessage: 'test-fixture: retired after scenario' },
      })
    );
  });

  /**
   * deliverProposalEmail is invoked by app/api/proposal/id/[id]/send/route.ts
   * inside the authenticated request's ambient tenant context (getTenantId()).
   * It scopes some of its own queries with runWithTenantAsync(input.tenantId)
   * but not all (see S7f) — so the harness supplies the same ambient context
   * the production caller does.
   */
  const deliverAsRoute = (input: Parameters<typeof deliverProposalEmail>[0]) =>
    runWithTenantAsync(input.tenantId, () => deliverProposalEmail(input));

  // ── fixtures ────────────────────────────────────────────────────────────────
  async function makeLeadWithDueEmail(label: string) {
    return runWithTenantBypass('test-fixture:create-lead', async () => {
      const lead = await prisma.prospectLead.create({
        data: {
          tenantId,
          source: 'fixture',
          sourceExternalId: `ext-${randomUUID()}`,
          businessName: `Lead ${label}`,
          city: 'Testville',
          vertical: 'dental',
          status: 'ENRICHED',
          painScore: 85,
          decisionMakerEmail: `owner-${randomUUID().slice(0, 8)}@prospect-${label}.test`,
          outreachStage: 'EMAIL_SENT',
          scorecardToken: randomUUID(),
        },
      });
      const email = await prisma.outreachEmail.create({
        data: {
          tenantId,
          leadId: lead.id,
          type: 'FOLLOWUP_COMPETITOR',
          status: 'PENDING',
          subject: `Quick note for ${lead.businessName}`,
          body: `Hi — here is your scorecard: http://localhost:3000/outreach/scorecard/${lead.scorecardToken}`,
          qualityScore: 90,
          scorecardUrl: `http://localhost:3000/outreach/scorecard/${lead.scorecardToken}`,
          sequencePosition: 2,
          scheduledAt: new Date(Date.now() - 60_000),
        },
      });
      return { lead, email };
    });
  }

  const readEmail = (id: string) =>
    runWithTenantBypass('test-fixture:read-email', () => prisma.outreachEmail.findUniqueOrThrow({ where: { id } }));
  const readLead = (id: string) =>
    runWithTenantBypass('test-fixture:read-lead', () => prisma.prospectLead.findUniqueOrThrow({ where: { id } }));
  const sentEvents = (emailId: string) =>
    runWithTenantBypass('test-fixture:read-events', () =>
      prisma.outreachEmailEvent.findMany({ where: { emailId, type: 'EMAIL_SENT' } })
    );

  async function makeReadyProposal(label: string) {
    return runWithTenantBypass('test-fixture:create-proposal', async () => {
      const audit = await prisma.audit.create({
        data: { tenantId, businessName: `Proposal ${label}`, status: 'COMPLETE', trustState: 'TRUSTED' },
      });
      const proposal = await prisma.proposal.create({
        data: {
          tenantId,
          auditId: audit.id,
          status: 'READY',
          prospectEmail: `buyer-${randomUUID().slice(0, 8)}@prospect-${label}.test`,
          outboundEnabled: true,
        },
      });
      return proposal;
    });
  }
  const readProposal = (id: string) =>
    runWithTenantBypass('test-fixture:read-proposal', () => prisma.proposal.findUniqueOrThrow({ where: { id } }));
  const outreachRows = (proposalId: string) =>
    runWithTenantBypass('test-fixture:read-outreach', () => prisma.proposalOutreach.findMany({ where: { proposalId } }));

  const proposalInput = (p: { id: string; webLinkToken: string; prospectEmail: string | null }) => ({
    tenantId,
    proposalId: p.id,
    webLinkToken: p.webLinkToken,
    recipient: p.prospectEmail!,
    from: 'hello@reliability-fixture.test',
    fromName: 'Reliability Fixture',
    subject: 'Your proposal',
    html: '<p>proposal</p>',
    approved: true,
  });

  // ── S7 ──────────────────────────────────────────────────────────────────────
  it('S7a: OUTREACH_LIVE_SENDING unset (no env, no flag row) → sniper uses the sandbox mock transport; provider never called', async () => {
    const { lead, email } = await makeLeadWithDueEmail('s7a');

    const result = await processSniperOutreach(tenantId);

    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    const row = await readEmail(email.id);
    expect(row.providerMessageId).toMatch(/^mock_/);
    expect(row.sentAt).not.toBeNull();
    const events = await sentEvents(email.id);
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as { isMock?: boolean }).isMock).toBe(true);
    const detail = result.details.find((d) => d.leadId === lead.id);
    expect(detail?.outcome).toBe('mock-sent');

    // Observation O-7 for the closure doc: the sandbox mock is persisted with
    // status SENT (not the available SIMULATED enum value). Recorded, not asserted
    // as a failure.
     
    console.info(`[S7a] sandbox mock persisted as status=${row.status} providerMessageId=${row.providerMessageId}`);
    expect(['SENT', 'SIMULATED']).toContain(row.status);
  });

  it('S7b: OUTREACH_LIVE_SENDING="false" explicitly → mock transport; provider never called', async () => {
    process.env.OUTREACH_LIVE_SENDING = 'false';
    const { email } = await makeLeadWithDueEmail('s7b');

    await processSniperOutreach(tenantId);

    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    expect((await readEmail(email.id)).providerMessageId).toMatch(/^mock_/);
  });

  it('S7c: flag drift — DB FeatureFlag OUTREACH_LIVE_SENDING=true but OUTBOUND_DELIVERY_ENABLED unset → live send refused, provider never called, email FAILED', async () => {
    await FeatureFlagService.setFlag('OUTREACH_LIVE_SENDING', true);
    FeatureFlagService.invalidateCache();
    delete process.env.OUTBOUND_DELIVERY_ENABLED;
    const { lead, email } = await makeLeadWithDueEmail('s7c');

    const result = await processSniperOutreach(tenantId);

    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    const row = await readEmail(email.id);
    expect(row.status).toBe('FAILED');
    expect(row.providerMessageId).toBeNull();
    expect(row.errorMessage).toMatch(/OUTREACH_LIVE_SENDING and OUTBOUND_DELIVERY_ENABLED must both be true/);
    expect(await sentEvents(email.id)).toHaveLength(0);
    expect((await readLead(lead.id)).outreachAttempts).toBe(0);
    expect(result.details.find((d) => d.leadId === lead.id)?.outcome).toBe('send-failed');
  });

  it('S7d: deliverProposalEmail never returns SENT while live gates are off (disabled → FAILED, sandbox → SIMULATED, forced live → refused)', async () => {
    const proposal = await makeReadyProposal('s7d');

    // disabled: non-test NODE_ENV with no OUTBOUND_MODE → 'disabled'; returns before DB.
    process.env.NODE_ENV = 'development';
    expect(outboundMode()).toBe('disabled');
    const disabled = await deliverAsRoute(proposalInput(proposal));
    expect(disabled).toEqual({ state: 'FAILED', reason: 'Outbound delivery is disabled' });

    // sandbox: explicit mode → SIMULATED, no provider call, no ProposalOutreach row.
    process.env.OUTBOUND_MODE = 'sandbox';
    expect(outboundMode()).toBe('sandbox');
    const sandbox = await deliverAsRoute(proposalInput(proposal));
    expect(sandbox.state).toBe('SIMULATED');

    // live requested by the caller but env gates are off → refused before any provider call.
    delete process.env.OUTBOUND_MODE;
    await expect(deliverAsRoute({ ...proposalInput(proposal), mode: 'live' })).rejects.toThrow(
      /OUTREACH_LIVE_SENDING and OUTBOUND_DELIVERY_ENABLED must both be true/
    );

    // OUTBOUND_MODE=live alone (without both env gates) still resolves to disabled.
    process.env.OUTBOUND_MODE = 'live';
    expect(outboundMode()).toBe('disabled');
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    expect(outboundMode()).toBe('disabled');

    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    expect((await readProposal(proposal.id)).status).toBe('READY');
    expect(await outreachRows(proposal.id)).toHaveLength(0);
  });

  /**
   * DEFECT-D3 (low, latent): lib/outreach/outboundDelivery.ts:65 runs
   * `prisma.emailBlocklist.findUnique` WITHOUT runWithTenantAsync(input.tenantId),
   * unlike the proposal / proposalOutreach queries around it (lines 56, 69, 80,
   * 85, 93, 103, 109). The function therefore depends on the caller's ambient
   * tenant context even though it receives tenantId explicitly. Today the only
   * approved:true caller (app/api/proposal/id/[id]/send/route.ts) supplies that
   * context, and the public token route returns AWAITING_APPROVAL at line 49
   * before reaching line 65, so production is not affected — but any future
   * background/reconciliation caller without ambient context fails closed with
   * MissingTenantError. Recorded here so the dependency is explicit.
   */
  it('S7f (DEFECT-D3, fails closed): deliverProposalEmail without ambient tenant context throws MissingTenantError at the blocklist lookup; provider never called', async () => {
    process.env.OUTBOUND_MODE = 'sandbox';
    const proposal = await makeReadyProposal('s7f');
    await expect(deliverProposalEmail(proposalInput(proposal))).rejects.toThrow(
      /Tenant context required for EmailBlocklist\.findUnique/
    );
    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    expect(await outreachRows(proposal.id)).toHaveLength(0);
  });

  it('S7e: KILL_SWITCH_FORCE_MANUAL_MODE halts the sniper before any send or DB mutation', async () => {
    process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'true';
    process.env.OUTREACH_LIVE_SENDING = 'true';
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    FeatureFlagService.invalidateCache();
    const { email } = await makeLeadWithDueEmail('s7e');

    const result = await processSniperOutreach(tenantId);

    expect(result.halted).toBe(true);
    expect(result.processedLeads).toBe(0);
    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    const row = await readEmail(email.id);
    expect(row.status).toBe('PENDING');
    expect(row.providerMessageId).toBeNull();
  });

  // ── S8 ──────────────────────────────────────────────────────────────────────
  it('S8a: live forced on, provider.send throws → outreach email FAILED (not SENT), lead not advanced, no EMAIL_SENT event', async () => {
    process.env.OUTREACH_LIVE_SENDING = 'true';
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    FeatureFlagService.invalidateCache();
    providerSpy.send.mockRejectedValue(new Error('Resend 500: upstream unavailable'));
    const { lead, email } = await makeLeadWithDueEmail('s8a');

    const result = await processSniperOutreach(tenantId);

    expect(providerSpy.send).toHaveBeenCalledTimes(1);
    const row = await readEmail(email.id);
    expect(row.status).toBe('FAILED');
    expect(row.sentAt).toBeNull();
    expect(row.providerMessageId).toBeNull();
    expect(row.errorMessage).toBe('Resend 500: upstream unavailable');
    expect(await sentEvents(email.id)).toHaveLength(0);
    const leadRow = await readLead(lead.id);
    expect(leadRow.outreachAttempts).toBe(0);
    expect(leadRow.outreachLastContactedAt).toBeNull();
    expect(result.details.find((d) => d.leadId === lead.id)).toMatchObject({ outcome: 'send-failed' });

    // The failed email is terminal for the sequence — a second tick does not resend it.
    providerSpy.send.mockClear();
    await processSniperOutreach(tenantId);
    expect(providerSpy.send).toHaveBeenCalledTimes(0);
  });

  it('S8b: live forced on, provider.send throws inside deliverProposalEmail → ProposalOutreach UNKNOWN_PROVIDER_OUTCOME, proposal not SENT, retry blocked', async () => {
    process.env.OUTREACH_LIVE_SENDING = 'true';
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    process.env.OUTBOUND_MODE = 'live';
    expect(outboundMode()).toBe('live');
    providerSpy.send.mockRejectedValue(new Error('SMTP 421 service not available'));
    const proposal = await makeReadyProposal('s8b');

    await expect(deliverAsRoute(proposalInput(proposal))).rejects.toThrow('SMTP 421 service not available');

    expect(providerSpy.send).toHaveBeenCalledTimes(1);
    const rows = await outreachRows(proposal.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sentAt).toBeNull();
    expect(rows[0]!.providerMessageId).toBeNull();
    expect(rows[0]!.errorMessage).toMatch(/^UNKNOWN_PROVIDER_OUTCOME: SMTP 421/);
    expect((await readProposal(proposal.id)).status).toBe('READY');

    // Retry with the same idempotency key must NOT resend (provider outcome unknown → reconcile).
    providerSpy.send.mockClear();
    providerSpy.send.mockResolvedValue({ messageId: 'msg_should_not_happen', provider: 'resend', state: 'ACCEPTED_BY_PROVIDER' });
    const retry = await deliverAsRoute(proposalInput(proposal));
    expect(retry.state).toBe('QUEUED');
    expect(retry.state).not.toBe('SENT');
    expect(providerSpy.send).toHaveBeenCalledTimes(0);
    expect(await outreachRows(proposal.id)).toHaveLength(1);
    expect((await readProposal(proposal.id)).status).toBe('READY');
  });

  it('S8c (control): live forced on and provider succeeds → exactly one send, proposal SENT, second call is idempotent (no resend)', async () => {
    process.env.OUTREACH_LIVE_SENDING = 'true';
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    process.env.OUTBOUND_MODE = 'live';
    providerSpy.send.mockResolvedValue({ messageId: 'msg_ok_1', provider: 'resend', state: 'ACCEPTED_BY_PROVIDER' });
    const proposal = await makeReadyProposal('s8c');

    const first = await deliverAsRoute(proposalInput(proposal));
    expect(first).toMatchObject({ state: 'SENT', messageId: 'msg_ok_1' });
    expect((await readProposal(proposal.id)).status).toBe('SENT');

    const second = await deliverAsRoute(proposalInput(proposal));
    expect(second).toMatchObject({ state: 'SENT', messageId: 'msg_ok_1' });
    expect(providerSpy.send).toHaveBeenCalledTimes(1);
    expect(await outreachRows(proposal.id)).toHaveLength(1);
  });
});
