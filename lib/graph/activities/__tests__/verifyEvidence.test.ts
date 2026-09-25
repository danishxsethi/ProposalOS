import { describe, expect, it } from 'vitest';

import { verifyEvidenceActivity } from '../verifyEvidence';

const finding = (module: string, collectedAt: string) => ({
  module,
  evidence: [{ pointer: 'https://example.test/', source: module, collected_at: collectedAt }],
}) as any;

const snapshot = (module: string, collectedAt: Date) => ({ module, collectedAt }) as any;

describe('verifyEvidenceActivity', () => {
  it('accepts fresh finding evidence when its module has a fresh persisted snapshot', async () => {
    const result = await verifyEvidenceActivity(
      [finding('seo', new Date().toISOString())],
      24,
      [snapshot('seo', new Date())]
    );

    expect(result).toMatchObject({ staleCount: 0, invalidCount: 0 });
    expect(result.findings[0]).toMatchObject({ unverified: false, stale: false });
  });

  it('rejects stale snapshots and snapshots from a different module', async () => {
    const stale = await verifyEvidenceActivity(
      [finding('seo', new Date().toISOString())],
      24,
      [snapshot('seo', new Date(Date.now() - 25 * 60 * 60 * 1000))]
    );
    expect(stale).toMatchObject({ staleCount: 1, invalidCount: 1 });

    const wrongModule = await verifyEvidenceActivity(
      [finding('seo', new Date().toISOString())],
      24,
      [snapshot('performance', new Date())]
    );
    expect(wrongModule).toMatchObject({ staleCount: 1, invalidCount: 1 });
    expect(wrongModule.findings[0]).toMatchObject({ unverified: true, stale: true });
  });

  it('rejects future-dated evidence instead of treating it as fresh', async () => {
    const future = await verifyEvidenceActivity(
      [finding('seo', new Date(Date.now() + 60_000).toISOString())],
      24,
      [snapshot('seo', new Date(Date.now() + 60_000))]
    );

    expect(future).toMatchObject({ staleCount: 1, invalidCount: 1 });
  });
});
