// @vitest-environment node
/**
 * lib/llm/__tests__/fixture-provider.test.ts
 *
 * Qualification for the test-scoped deterministic fixture LLM provider:
 *   1. It refuses to select outside test environments (NODE_ENV=production).
 *   2. It derives schema-valid, citation-correct JSON from the caller's own
 *      validated prompt data (clustering, narratives, executive summary).
 *   3. Unknown nodes fail closed with FIXTURE_LLM_NO_RESPONDER (no invented
 *      output shapes) so existing fallbacks engage.
 *   4. generateWithLLM routes to the fixture provider and labels responses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isFixtureLlmEnabled, isFixtureLlmSelected } from '@/lib/llm/mode';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function enableFixture() {
  process.env.PROPOSALOS_FIXTURE_LLM_ENABLED = 'true';
  process.env.LLM_PRIMARY_PROVIDER = 'fixture';
  process.env.NODE_ENV = 'test';
}

beforeEach(() => {
  enableFixture();
});

afterEach(() => {
  delete process.env.PROPOSALOS_FIXTURE_LLM_ENABLED;
  delete process.env.LLM_PRIMARY_PROVIDER;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV ?? 'test';
});

describe('fixture LLM mode guards', () => {
  it('selects only when explicitly enabled', () => {
    delete process.env.PROPOSALOS_FIXTURE_LLM_ENABLED;
    expect(isFixtureLlmEnabled()).toBe(false);
    expect(isFixtureLlmSelected()).toBe(false);
  });

  it('hard-refuses in production even when configured', () => {
    process.env.NODE_ENV = 'production';
    expect(isFixtureLlmEnabled()).toBe(false);
    expect(isFixtureLlmSelected()).toBe(false);
  });

  it('selects in test mode when configured', () => {
    expect(isFixtureLlmSelected()).toBe(true);
  });
});

describe('fixture provider deterministic responders', () => {
  it('serves MULTI_STEP clustering JSON covering every validated finding (≤5 clusters)', async () => {
    const { fixtureProvider } = await import('@/lib/llm/providers/fixture');
    const prompt = [
      'Cluster validated audit Findings into at most five related groups.',
      'Return only strict JSON: {"clusters":[{"root_cause":"supported summary","finding_ids":["F1","F4"]}]}',
      '<UNTRUSTED_FINDINGS>',
      JSON.stringify([
        {
          ref: 'F1',
          title: 'Missing meta description',
          module: 'seo',
          category: 'SEO',
          impactScore: 6,
        },
        {
          ref: 'F2',
          title: 'Low word count on services page',
          module: 'content',
          category: 'Content',
          impactScore: 5,
        },
      ]),
      '</UNTRUSTED_FINDINGS>',
      '<PRECLUSTERS>',
      JSON.stringify([{ key: 'seo', refs: ['F1', 'F2'] }]),
      '</PRECLUSTERS>',
    ].join('\n');

    const response = await fixtureProvider.generateContent({
      provider: 'fixture' as any,
      model: 'us.amazon.nova-micro-v1:0',
      input: prompt,
      metadata: { node: 'cluster_root_causes' },
    } as any);

    expect(response.provider).toBe('fixture');
    const parsed = JSON.parse(response.text);
    const covered = new Set(parsed.clusters.flatMap((c: any) => c.finding_ids));
    expect(parsed.clusters.length).toBeLessThanOrEqual(5);
    // The diagnosis validator requires EVERY finding to be clustered.
    expect(covered.has('F1')).toBe(true);
    expect(covered.has('F2')).toBe(true);
    for (const cluster of parsed.clusters) {
      expect(cluster.root_cause.length).toBeGreaterThan(0);
    }
  });

  it('serves narratives citing only the allowed refs', async () => {
    const { fixtureProvider } = await import('@/lib/llm/providers/fixture');
    const prompt = [
      'Return only strict JSON: {"narrative":"text","finding_ids":["F1","F3"]}',
      '<UNTRUSTED_FINDINGS>',
      JSON.stringify([
        { ref: 'F1', title: 'Slow page load', description: 'LCP 9.2s', impactScore: 8 },
        { ref: 'F2', title: 'No privacy policy', description: '', impactScore: 4 },
      ]),
      '</UNTRUSTED_FINDINGS>',
      '<ALLOWED_REFS>',
      JSON.stringify(['F1']),
      '</ALLOWED_REFS>',
    ].join('\n');

    const response = await fixtureProvider.generateContent({
      provider: 'fixture' as any,
      model: 'us.amazon.nova-2-lite-v1:0',
      input: prompt,
      metadata: { node: 'generate_narrative' },
    } as any);

    const parsed = JSON.parse(response.text);
    expect(parsed.finding_ids).toEqual(['F1']);
    expect(parsed.narrative).toContain('Slow page load');
  });

  it('serves an explicit empty adversarial-QA verdict', async () => {
    const { fixtureProvider } = await import('@/lib/llm/providers/fixture');
    const response = await fixtureProvider.generateContent({
      provider: 'fixture' as any,
      model: 'us.amazon.nova-micro-v1:0',
      input: 'Identify unsupported factual claims...',
      metadata: { node: 'adversarial_qa' },
    } as any);
    expect(JSON.parse(response.text)).toEqual([]);
  });

  it('fails closed with FIXTURE_LLM_NO_RESPONDER for unknown nodes', async () => {
    const { fixtureProvider } = await import('@/lib/llm/providers/fixture');
    await expect(
      fixtureProvider.generateContent({
        provider: 'fixture' as any,
        model: 'us.amazon.nova-micro-v1:0',
        input: 'some prompt nobody taught the fixture provider',
        metadata: { node: 'never_taught_node' },
      } as any)
    ).rejects.toThrow('FIXTURE_LLM_NO_RESPONDER');
  });
});

describe('generateWithLLM fixture routing', () => {
  it('routes to the fixture provider and returns labeled deterministic output', async () => {
    const { generateWithLLM } = await import('@/lib/llm/provider');
    const result = await generateWithLLM({
      model: 'us.amazon.nova-micro-v1:0',
      input:
        'Return only strict JSON: {"clusters":[]}\n<UNTRUSTED_FINDINGS>[]</UNTRUSTED_FINDINGS>',
      responseModality: 'json',
      metadata: { node: 'adversarial_qa' },
    });
    expect(result.provider).toBe('fixture');
    expect(JSON.parse(result.text)).toEqual([]);
  });

  it('keeps Bedrock as the only supported non-fixture provider', async () => {
    delete process.env.PROPOSALOS_FIXTURE_LLM_ENABLED;
    process.env.LLM_PRIMARY_PROVIDER = 'openai';
    const { generateWithLLM } = await import('@/lib/llm/provider');
    await expect(
      generateWithLLM({
        model: 'gpt-4',
        input: 'x',
      })
    ).rejects.toThrow('Unsupported LLM_PRIMARY_PROVIDER "openai"');
  });
});
