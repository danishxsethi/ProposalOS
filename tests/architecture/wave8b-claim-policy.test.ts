import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Wave 8B claim-policy architecture', () => {
  it('routes diagnosis and proposal claims through shared grounding validators', () => {
    expect(source('lib/diagnosis/llmCluster.ts')).toContain('validateCustomerClaim');
    expect(source('lib/proposal/grounding.ts')).toContain('validateCustomerClaim');
    expect(source('lib/qa/autoQA.ts')).toContain('validateProposalGrounding');
    expect(source('lib/proposal/ProposalQAService.ts')).toContain('validateProposalGrounding');
  });

  it('does not permit model-controlled commercial values or timeout fallback proposals', () => {
    const graph = source('lib/graph/proposal-graph.ts');
    const orchestrator = source('lib/proposal/llm-orchestrator.ts');

    expect(graph).not.toContain('monthlyValue: 0');
    expect(graph).not.toContain('returning fallback proposal state');
    expect(orchestrator).not.toContain('generate_roi_model');
    expect(orchestrator).not.toContain('hardenedContent ||');
  });

  it.each([
    'app/api/proposal/token/[token]/route.ts',
    'app/api/proposals/[id]/send/route.ts',
    'app/api/proposal/token/[token]/pdf/route.ts',
    'app/api/proposal/token/[token]/email/route.ts',
    'app/api/proposal/token/[token]/status/route.ts',
    'app/api/proposal/token/[token]/share/route.ts',
    'app/api/proposal/token/[token]/accept/route.ts',
    'app/api/proposal-status/status/route.ts',
    'app/presentation/[token]/page.tsx',
    'app/api/presentation/[token]/export/route.ts',
  ])('blocks publication without persisted QA and grounding in %s', (path) => {
    if (path === 'app/api/proposals/[id]/send/route.ts') {
      expect(source(path)).toContain('resolvePublicProposalAccess');
      expect(source(path)).toContain('PublicProposalAccessError');
    } else {
      expect(source(path)).toContain('resolvePublicProposalAccess');
      expect(source('lib/proposal/publicAccess.ts')).toContain('assertProposalPublishable');
    }
  });
});
