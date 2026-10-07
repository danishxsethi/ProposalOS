// @vitest-environment node
/**
 * tests/reliability/llm-provider-resilience.test.ts
 *
 * Stream D — S5: LLM 429 / 5xx / timeout / malformed-JSON resilience.
 *
 * Unit-level: the Amazon Bedrock provider is replaced with a fake whose failure mode is
 * scripted per test; every attempt is counted. Retry/circuit-breaker
 * configuration is read from process.env at module load, so each test resets
 * the module registry and imports lib/llm/provider.ts fresh with tiny delays
 * (so bounded-retry assertions run in milliseconds and the circuit breaker
 * starts closed).
 *
 * Also covers lib/llm/providers/registry.ts's fallback-chain classification
 * with fake providers, and the consumer-side schema rejection of malformed JSON
 * (lib/proposal/llm-orchestrator.ts::generateExecutiveSummary).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fake Bedrock provider ───────────────────────────────────────────────────
type GenerateImpl = (options: { model: string; input: unknown; signal?: AbortSignal }) => Promise<{
  text: string;
  provider: 'bedrock';
  model: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}>;

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn<GenerateImpl>(),
}));

vi.mock('@/lib/llm/providers/bedrock', () => ({
  bedrockProvider: {
    resolveModelId: (model: string) => model,
    generateContent: sdk.generateContent,
    generateContentStream: vi.fn(),
  },
}));

// Telemetry sinks are external to the retry contract; keep them inert.
vi.mock('@/lib/self-evolving-prompts/PromptPerformanceTracker', () => ({
  PromptPerformanceTracker: class {
    logPerformance() {
      return Promise.resolve();
    }
  },
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({
  MetricsRecorder: { llmCall: vi.fn(), auditRun: vi.fn() },
}));
vi.mock('@/lib/llm/audit-logger', () => ({
  llmAuditLogger: {
    logRequest: vi.fn(() => 'log-1'),
    logResponse: vi.fn(),
    logRateLimit: vi.fn(),
    logRetry: vi.fn(),
  },
}));
vi.mock('@/lib/tracing', () => ({
  traceLlmCall: (_cfg: unknown, fn: () => Promise<unknown>) => fn(),
}));

function httpError(status: number, message = `HTTP ${status}`, headers?: Record<string, string>) {
  return Object.assign(new Error(message), { status, headers });
}

function okResponse(text: string) {
  return {
    text,
    provider: 'bedrock' as const,
    model: 'us.amazon.nova-micro-v1:0',
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  };
}

const ENV_KEYS = [
  'LLM_MAX_RETRIES',
  'LLM_BASE_RETRY_DELAY_MS',
  'LLM_MAX_RETRY_DELAY_MS',
  'LLM_DEFAULT_TIMEOUT_MS',
  'LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
  'LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
  'LLM_CIRCUIT_BREAKER_TIMEOUT_MS',
  'LLM_PRIMARY_PROVIDER',
  'BEDROCK_ENABLED',
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const MAX_RETRIES = 2; // attempts = MAX_RETRIES + 1 = 3
const TIMEOUT_MS = 60;

async function freshProvider(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  process.env.LLM_PRIMARY_PROVIDER = 'bedrock';
  process.env.BEDROCK_ENABLED = 'true';
  process.env.LLM_MAX_RETRIES = String(MAX_RETRIES);
  process.env.LLM_BASE_RETRY_DELAY_MS = '1';
  process.env.LLM_MAX_RETRY_DELAY_MS = '3';
  process.env.LLM_DEFAULT_TIMEOUT_MS = String(TIMEOUT_MS);
  process.env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD = '100'; // keep closed unless a test lowers it
  process.env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD = '1';
  process.env.LLM_CIRCUIT_BREAKER_TIMEOUT_MS = '60000';
  Object.assign(process.env, overrides);
  return import('@/lib/llm/provider');
}

const baseCall = {
  model: 'us.amazon.nova-micro-v1:0',
  input: 'reliability probe',
  metadata: { useCache: false, skipValidation: true, node: 'reliability' },
};

describe('Stream D — S5 LLM provider resilience (fake SDK, bounded retries)', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    sdk.generateContent.mockReset();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('S5a: persistent 429 → exactly MAX_RETRIES+1 attempts, then the error surfaces (no infinite retry, no silent success)', async () => {
    const { generateWithLLM } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(429, 'Resource exhausted', { 'retry-after': '0' });
    });

    const started = Date.now();
    await expect(generateWithLLM({ ...baseCall })).rejects.toMatchObject({ status: 429 });
    const elapsed = Date.now() - started;

    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(elapsed).toBeLessThan(2_000);

    console.info(
      `[S5a] 429: attempts=${sdk.generateContent.mock.calls.length} (max ${MAX_RETRIES + 1}) elapsed=${elapsed}ms`
    );
  });

  it('S5a2: 429 that clears on the last permitted attempt → success without exceeding the bound', async () => {
    const { generateWithLLM } = await freshProvider();
    let n = 0;
    sdk.generateContent.mockImplementation(async () => {
      n += 1;
      if (n <= MAX_RETRIES) throw httpError(429, 'Resource exhausted', { 'retry-after': '0' });
      return okResponse('recovered');
    });

    const result = await generateWithLLM({ ...baseCall });
    expect(result.text).toBe('recovered');
    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('S5b: persistent 5xx → bounded to MAX_RETRIES+1 attempts, then throws', async () => {
    const { generateWithLLM } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(503, 'Service Unavailable');
    });

    await expect(generateWithLLM({ ...baseCall })).rejects.toMatchObject({ status: 503 });
    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);

    console.info(
      `[S5b] 5xx: attempts=${sdk.generateContent.mock.calls.length} (max ${MAX_RETRIES + 1})`
    );
  });

  it('S5b2: 4xx client errors (400) are NOT retried — single attempt', async () => {
    const { generateWithLLM } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(400, 'Invalid argument');
    });

    await expect(generateWithLLM({ ...baseCall })).rejects.toMatchObject({ status: 400 });
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });

  it('S5c: hung provider is aborted at the configured timeout on every attempt; total time is bounded', async () => {
    const { generateWithLLM } = await freshProvider();
    const abortedAt: number[] = [];
    sdk.generateContent.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          const t0 = Date.now();
          signal?.addEventListener('abort', () => {
            abortedAt.push(Date.now() - t0);
            reject(Object.assign(new Error('Request timeout'), { name: 'AbortError' }));
          });
        })
    );

    const started = Date.now();
    await expect(generateWithLLM({ ...baseCall })).rejects.toThrow(/timeout/i);
    const elapsed = Date.now() - started;

    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(abortedAt).toHaveLength(MAX_RETRIES + 1);
    for (const a of abortedAt) {
      expect(a).toBeGreaterThanOrEqual(TIMEOUT_MS - 5);
      expect(a).toBeLessThan(TIMEOUT_MS + 150);
    }
    // 3 attempts × 60 ms + tiny backoff — must stay far below a "hung forever".
    expect(elapsed).toBeLessThan((MAX_RETRIES + 1) * TIMEOUT_MS + 500);

    console.info(
      `[S5c] timeout: attempts=${abortedAt.length} abort latencies=${abortedAt.join(',')}ms total=${elapsed}ms`
    );
  });

  it('S5c2: per-request metadata.timeoutMs override is honoured', async () => {
    const { generateWithLLM } = await freshProvider({ LLM_MAX_RETRIES: '0' });
    let abortedAfter = -1;
    sdk.generateContent.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          const t0 = Date.now();
          signal?.addEventListener('abort', () => {
            abortedAfter = Date.now() - t0;
            reject(new Error('Request timeout'));
          });
        })
    );
    await expect(
      generateWithLLM({ ...baseCall, metadata: { ...baseCall.metadata, timeoutMs: 20 } })
    ).rejects.toThrow(/timeout/i);
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    expect(abortedAfter).toBeGreaterThanOrEqual(15);
    expect(abortedAfter).toBeLessThan(200);
  });

  it('S5d: circuit breaker opens after the failure threshold and short-circuits subsequent calls with ZERO provider attempts', async () => {
    const { generateWithLLM, getCircuitBreakerStatus } = await freshProvider({
      LLM_MAX_RETRIES: '0',
      LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(500, 'Internal');
    });

    await expect(generateWithLLM({ ...baseCall })).rejects.toThrow();
    await expect(generateWithLLM({ ...baseCall })).rejects.toThrow();
    expect(getCircuitBreakerStatus().state).toBe('open');
    expect(sdk.generateContent).toHaveBeenCalledTimes(2);

    sdk.generateContent.mockClear();
    await expect(generateWithLLM({ ...baseCall })).rejects.toThrow(/Circuit breaker is open/);
    expect(sdk.generateContent).toHaveBeenCalledTimes(0);
  });

  it('S5e (provider layer): malformed JSON in json modality is returned verbatim — the provider does NOT validate schema; rejection must happen in the consumer', async () => {
    const { generateWithLLM } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => okResponse('{"text": "unterminated'));

    const result = await generateWithLLM({ ...baseCall, responseModality: 'json' });
    expect(result.text).toBe('{"text": "unterminated');
    expect(() => JSON.parse(result.text)).toThrow();
    expect(sdk.generateContent).toHaveBeenCalledTimes(1); // malformed output is not treated as retryable
  });

  it('S5e (consumer layer): ProposalLLMOrchestrator.generateExecutiveSummary rejects malformed / off-schema JSON with success:false and empty content — never a silent pass', async () => {
    vi.resetModules();
    process.env.LLM_PRIMARY_PROVIDER = 'bedrock';
    process.env.BEDROCK_ENABLED = 'true';
    const outputs = [
      '{"text": "unterminated', // not JSON
      '{"text": "' + 'x'.repeat(80) + '"}', // missing finding_ids (schema)
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": []}', // empty citations (schema min(1))
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": ["ghost"]}', // unknown Finding citation
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": ["f1"], "extra": 1}', // strict(): unknown key
    ];
    let i = 0;
    sdk.generateContent.mockImplementation(async () => okResponse(outputs[i++ % outputs.length]!));

    const { ProposalLLMOrchestrator } = await import('@/lib/proposal/llm-orchestrator');
    const orchestrator = new ProposalLLMOrchestrator({ model: 'us.amazon.nova-micro-v1:0' });
    const findings = [
      {
        id: 'f1',
        auditId: 'a1',
        tenantId: 't1',
        module: 'website',
        category: 'Performance',
        type: 'VITAMIN',
        title: 'Slow LCP',
        description: 'LCP 4.2s',
        metrics: {},
      },
    ] as unknown as import('@prisma/client').Finding[];

    for (let k = 0; k < outputs.length; k++) {
      // Distinct business label per iteration → distinct prompt → no LLM cache hit.
      const res = await orchestrator.generateExecutiveSummary(`Acme ${k}`, [], findings);
      expect(res.success, `output #${k} must be rejected: ${outputs[k]}`).toBe(false);
      expect(res.content).toBe('');
      expect(res.error).toBeTruthy();
    }
    expect(sdk.generateContent).toHaveBeenCalledTimes(outputs.length);
  });

  it('S5e (observation O-5): the LLM cache stores an unparseable JSON payload, so an identical retry is served the poisoned entry without reaching the provider', async () => {
    vi.resetModules();
    process.env.LLM_PRIMARY_PROVIDER = 'bedrock';
    process.env.BEDROCK_ENABLED = 'true';
    sdk.generateContent.mockImplementation(async () => okResponse('{"text": "unterminated'));
    const { ProposalLLMOrchestrator } = await import('@/lib/proposal/llm-orchestrator');
    const orchestrator = new ProposalLLMOrchestrator({ model: 'us.amazon.nova-micro-v1:0' });
    const findings = [
      {
        id: 'f1',
        auditId: 'a1',
        tenantId: 't1',
        module: 'website',
        category: 'Performance',
        type: 'VITAMIN',
        title: 'Slow LCP',
        description: 'LCP 4.2s',
        metrics: {},
      },
    ] as unknown as import('@prisma/client').Finding[];

    const first = await orchestrator.generateExecutiveSummary('Acme Cached', [], findings);
    const second = await orchestrator.generateExecutiveSummary('Acme Cached', [], findings);
    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    // Both rejected (safe), but the second never reached the model: the bad
    // payload was cached by lib/llm/provider.ts:584-607 (cache set happens
    // before any consumer schema validation).
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });
});

// ── Bedrock-only registry behavior ──────────────────────────────────────────
describe('Stream D — S5f Bedrock-only provider registry', () => {
  async function freshRegistry(primary = 'bedrock') {
    vi.resetModules();
    process.env.LLM_PRIMARY_PROVIDER = primary;
    process.env.BEDROCK_ENABLED = 'true';
    const { ProviderRegistry } = await import('@/lib/llm/providers/registry');
    const { LLMProvider } = await import('@/lib/llm/types');
    return { registry: new ProviderRegistry(), LLMProvider };
  }

  it('registers only Bedrock and rejects cross-provider fallback routes', async () => {
    const { registry, LLMProvider } = await freshRegistry();
    expect(registry.getAvailableProviders()).toEqual([LLMProvider.BEDROCK]);
  });

  it('returns a transient failure from Bedrock without trying another model provider', async () => {
    const { registry, LLMProvider } = await freshRegistry();
    let calls = 0;
    registry.register(
      LLMProvider.BEDROCK,
      {
        isAvailable: async () => true,
        getModelInfo: (modelName: string) => ({
          provider: LLMProvider.BEDROCK,
          modelName,
          contextWindow: 128_000,
          inputCostPer1k: 0,
          outputCostPer1k: 0,
        }),
        generateContent: async () => {
          calls++;
          throw httpError(503, 'Bedrock unavailable');
        },
      },
      0
    );

    const result = await registry.generateWithFallback({
      model: 'us.amazon.nova-micro-v1:0',
      input: 'probe',
    });
    expect(result.success).toBe(false);
    expect(result.attemptsMade.map((attempt) => attempt.provider)).toEqual([LLMProvider.BEDROCK]);
    expect(result.error?.type).toBe('transient');
    expect(calls).toBe(1);
  });

  it('rejects a non-Bedrock primary provider configuration', async () => {
    await expect(freshRegistry('google-ai')).rejects.toThrow(/Amazon Bedrock/);
  });
});
