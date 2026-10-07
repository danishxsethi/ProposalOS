import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  compile: vi.fn(),
  recordEvent: vi.fn(),
  sendProposalReady: vi.fn(),
  sendWebhook: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { audit: { findFirst: mocks.findFirst } } }));
vi.mock('@/lib/proposal/compiler', () => ({
  compileAndPersistProposal: mocks.compile,
  getCurrentProposalVersion: vi.fn().mockResolvedValue(1),
}));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_context: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({ MetricsRecorder: { proposalGenerated: vi.fn() } }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: mocks.recordEvent }));
vi.mock('@/lib/notifications/email', () => ({ sendProposalReady: mocks.sendProposalReady }));
vi.mock('@/lib/notifications/webhook', () => ({ sendWebhook: mocks.sendWebhook }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));

import { generateProposal } from '../runner';

describe('proposal worker compiler integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1', businessName: 'Acme' });
    mocks.compile.mockResolvedValue({
      diagnosis: { findings: [{ id: 'finding-1' }] },
      proposal: { executiveSummary: 'compiled' },
      proposalRecord: { id: 'proposal-1', webLinkToken: 'token-1', status: 'DRAFT' },
      evaluation: {
        autoQAStatus: { score: 20 },
        overallScore: 2,
        dimensions: {},
        feedbackLogs: ['needs review'],
        passed: false,
      },
      costTracker: { getTotalCents: () => 12 },
    });
    mocks.recordEvent.mockResolvedValue(undefined);
    mocks.sendProposalReady.mockResolvedValue(undefined);
  });

  it('uses the canonical compiler and returns the same persisted status rather than rerunning QA', async () => {
    const result = await generateProposal('audit-1');
    expect(mocks.compile).toHaveBeenCalledWith({ auditId: 'audit-1', tenantId: 'tenant-1', version: 1 });
    expect(result).toMatchObject({ proposalId: 'proposal-1', status: 'DRAFT', qaScore: 20 });
  });
});
