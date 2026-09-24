import { describe, expect, it } from 'vitest';

import { assessAuditResult, extractFindingsFromRegistryResult, type ModuleResult } from '@/lib/audit/runner';

function result(status: ModuleResult['status'], data: unknown = { findings: [], evidenceSnapshots: [] }): ModuleResult {
  return { status, data };
}

describe('campaign 1 audit trust contracts', () => {
  it('does not emit findings for unavailable observations', () => {
    const extracted = extractFindingsFromRegistryResult(
      'citations',
      result('UNAVAILABLE', { findings: [{ title: 'Not listed' }], evidenceSnapshots: [] }),
      { auditId: 'a', tenantId: 't' }
    );
    expect(extracted.findings).toEqual([]);
    expect(extracted.snapshots).toEqual([]);
  });

  it('preserves validated findings from partial module results', () => {
    const evidence = {
      pointer: 'https://business.test',
      source: 'pagespeed_v5',
      collected_at: new Date().toISOString(),
      value: 45,
    };
    const extracted = extractFindingsFromRegistryResult(
      'techStack',
      result('PARTIAL', {
        findings: [{ module: 'testModule', title: 'Slow measured page', category: 'Performance', type: 'PAINKILLER', impactScore: 8, confidenceScore: 8, evidence: [evidence], metrics: {}, recommendedFix: [] }],
        evidenceSnapshots: [{ source: 'pagespeed_v5', rawResponse: { score: 45 }, collectedAt: new Date() }],
      }),
      { auditId: 'a', tenantId: 't' }
    );
    expect(extracted.findings).toHaveLength(1);
    expect(extracted.snapshots).toHaveLength(1);
  });

  it('requires every required module to complete before trust can be TRUSTED', () => {
    const results = new Map<string, ModuleResult>();
    for (const name of ['website', 'websiteCrawler', 'gbp', 'competitor', 'techStack', 'security', 'coreWebVitals', 'schemaAnalysis', 'reputation', 'social', 'seoDeep', 'accessibility', 'mobileUX', 'contentQuality', 'conversion', 'citations', 'privacyCompliance', 'schemaMarkup', 'keywordGap', 'competitorStrategy']) {
      results.set(name, result('COMPLETE'));
    }
    expect(assessAuditResult(results, 0).trustState).toBe('TRUSTED');
    results.set('citations', result('UNAVAILABLE'));
    expect(assessAuditResult(results, 0).status).toBe('PARTIAL');
    expect(assessAuditResult(results, 0).trustState).toBe('DEGRADED_REVIEW_REQUIRED');
  });
});
