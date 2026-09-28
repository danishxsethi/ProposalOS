// @vitest-environment node
/**
 * tests/reliability/llm-provider-resilience.test.ts
 *
 * Stream D — S5: LLM 429 / 5xx / timeout / malformed-JSON resilience.
 *
 * Unit-level: the Google GenAI SDK is replaced with a fake whose failure mode is
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

// ── Fake Google GenAI SDK ────────────────────────────────────────────────────
type GenerateImpl = (
  req: unknown,
  opts: { signal?: AbortSignal }
) => Promise<{ response: { text?: () => string; candidates?: unknown[]; usageMetadata?: unknown } }>;

const sdk = vi.hoisted(() => ({
  generateContent: vi.fn<GenerateImpl>(),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(_key: string) {}
    getGenerativeModel() {
      return { generateContent: sdk.generateContent };
    }
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
    response: {
      text: () => text,
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    },
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
  'GOOGLE_AI_API_KEY',
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

const MAX_RETRIES = 2; // attempts = MAX_RETRIES + 1 = 3
const TIMEOUT_MS = 60;

async function freshProvider(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  process.env.GOOGLE_AI_API_KEY = 'fake-key-for-reliability-tests';
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
  model: 'gemini-2.0-flash',
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
    const { generateWithGemini } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(429, 'Resource exhausted', { 'retry-after': '0' });
    });

    const started = Date.now();
    await expect(generateWithGemini({ ...baseCall })).rejects.toMatchObject({ status: 429 });
    const elapsed = Date.now() - started;

    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(elapsed).toBeLessThan(2_000);
    // eslint-disable-next-line no-console
    console.info(`[S5a] 429: attempts=${sdk.generateContent.mock.calls.length} (max ${MAX_RETRIES + 1}) elapsed=${elapsed}ms`);
  });

  it('S5a2: 429 that clears on the last permitted attempt → success without exceeding the bound', async () => {
    const { generateWithGemini } = await freshProvider();
    let n = 0;
    sdk.generateContent.mockImplementation(async () => {
      n += 1;
      if (n <= MAX_RETRIES) throw httpError(429, 'Resource exhausted', { 'retry-after': '0' });
      return okResponse('recovered');
    });

    const result = await generateWithGemini({ ...baseCall });
    expect(result.text).toBe('recovered');
    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('S5b: persistent 5xx → bounded to MAX_RETRIES+1 attempts, then throws', async () => {
    const { generateWithGemini } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(503, 'Service Unavailable');
    });

    await expect(generateWithGemini({ ...baseCall })).rejects.toMatchObject({ status: 503 });
    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    // eslint-disable-next-line no-console
    console.info(`[S5b] 5xx: attempts=${sdk.generateContent.mock.calls.length} (max ${MAX_RETRIES + 1})`);
  });

  it('S5b2: 4xx client errors (400) are NOT retried — single attempt', async () => {
    const { generateWithGemini } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(400, 'Invalid argument');
    });

    await expect(generateWithGemini({ ...baseCall })).rejects.toMatchObject({ status: 400 });
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });

  it('S5c: hung provider is aborted at the configured timeout on every attempt; total time is bounded', async () => {
    const { generateWithGemini } = await freshProvider();
    const abortedAt: number[] = [];
    sdk.generateContent.mockImplementation(
      (_req, { signal }) =>
        new Promise((_resolve, reject) => {
          const t0 = Date.now();
          signal?.addEventListener('abort', () => {
            abortedAt.push(Date.now() - t0);
            reject(Object.assign(new Error('Request timeout'), { name: 'AbortError' }));
          });
        })
    );

    const started = Date.now();
    await expect(generateWithGemini({ ...baseCall })).rejects.toThrow(/timeout/i);
    const elapsed = Date.now() - started;

    expect(sdk.generateContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(abortedAt).toHaveLength(MAX_RETRIES + 1);
    for (const a of abortedAt) {
      expect(a).toBeGreaterThanOrEqual(TIMEOUT_MS - 5);
      expect(a).toBeLessThan(TIMEOUT_MS + 150);
    }
    // 3 attempts × 60 ms + tiny backoff — must stay far below a "hung forever".
    expect(elapsed).toBeLessThan((MAX_RETRIES + 1) * TIMEOUT_MS + 500);
    // eslint-disable-next-line no-console
    console.info(`[S5c] timeout: attempts=${abortedAt.length} abort latencies=${abortedAt.join(',')}ms total=${elapsed}ms`);
  });

  it('S5c2: per-request metadata.timeoutMs override is honoured', async () => {
    const { generateWithGemini } = await freshProvider({ LLM_MAX_RETRIES: '0' });
    let abortedAfter = -1;
    sdk.generateContent.mockImplementation(
      (_req, { signal }) =>
        new Promise((_resolve, reject) => {
          const t0 = Date.now();
          signal?.addEventListener('abort', () => {
            abortedAfter = Date.now() - t0;
            reject(new Error('Request timeout'));
          });
        })
    );
    await expect(
      generateWithGemini({ ...baseCall, metadata: { ...baseCall.metadata, timeoutMs: 20 } })
    ).rejects.toThrow(/timeout/i);
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    expect(abortedAfter).toBeGreaterThanOrEqual(15);
    expect(abortedAfter).toBeLessThan(200);
  });

  it('S5d: circuit breaker opens after the failure threshold and short-circuits subsequent calls with ZERO provider attempts', async () => {
    const { generateWithGemini, getCircuitBreakerStatus } = await freshProvider({
      LLM_MAX_RETRIES: '0',
      LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
    });
    sdk.generateContent.mockImplementation(async () => {
      throw httpError(500, 'Internal');
    });

    await expect(generateWithGemini({ ...baseCall })).rejects.toThrow();
    await expect(generateWithGemini({ ...baseCall })).rejects.toThrow();
    expect(getCircuitBreakerStatus().state).toBe('open');
    expect(sdk.generateContent).toHaveBeenCalledTimes(2);

    sdk.generateContent.mockClear();
    await expect(generateWithGemini({ ...baseCall })).rejects.toThrow(/Circuit breaker is open/);
    expect(sdk.generateContent).toHaveBeenCalledTimes(0);
  });

  it('S5e (provider layer): malformed JSON in json modality is returned verbatim — the provider does NOT validate schema; rejection must happen in the consumer', async () => {
    const { generateWithGemini } = await freshProvider();
    sdk.generateContent.mockImplementation(async () => okResponse('{"text": "unterminated'));

    const result = await generateWithGemini({ ...baseCall, responseModality: 'json' });
    expect(result.text).toBe('{"text": "unterminated');
    expect(() => JSON.parse(result.text)).toThrow();
    expect(sdk.generateContent).toHaveBeenCalledTimes(1); // malformed output is not treated as retryable
  });

  it('S5e (consumer layer): ProposalLLMOrchestrator.generateExecutiveSummary rejects malformed / off-schema JSON with success:false and empty content — never a silent pass', async () => {
    vi.resetModules();
    process.env.GOOGLE_AI_API_KEY = 'fake-key-for-reliability-tests';
    const outputs = [
      '{"text": "unterminated',                                   // not JSON
      '{"text": "' + 'x'.repeat(80) + '"}',                        // missing finding_ids (schema)
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": []}',     // empty citations (schema min(1))
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": ["ghost"]}', // unknown Finding citation
      '{"text": "' + 'x'.repeat(80) + '", "finding_ids": ["f1"], "extra": 1}', // strict(): unknown key
    ];
    let i = 0;
    sdk.generateContent.mockImplementation(async () => okResponse(outputs[i++ % outputs.length]!));

    const { ProposalLLMOrchestrator } = await import('@/lib/proposal/llm-orchestrator');
    const orchestrator = new ProposalLLMOrchestrator({ model: 'gemini-2.0-flash' });
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
    process.env.GOOGLE_AI_API_KEY = 'fake-key-for-reliability-tests';
    sdk.generateContent.mockImplementation(async () => okResponse('{"text": "unterminated'));
    const { ProposalLLMOrchestrator } = await import('@/lib/proposal/llm-orchestrator');
    const orchestrator = new ProposalLLMOrchestrator({ model: 'gemini-2.0-flash' });
    const findings = [
      { id: 'f1', auditId: 'a1', tenantId: 't1', module: 'website', category: 'Performance', type: 'VITAMIN', title: 'Slow LCP', description: 'LCP 4.2s', metrics: {} },
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

// ── Registry fallback-chain classification with fake providers ───────────────
describe('Stream D — S5f provider registry fallback chain (fake providers)', () => {
  type Behaviour = () => Promise<{ text: string }>;

  async function registryWith(behaviours: Record<string, Behaviour>) {
    vi.resetModules();
    vi.doMock('@/lib/llm/providers/google', () => ({ GoogleProvider: class {}, googleProvider: {} }));
    vi.doMock('@/lib/llm/providers/openai', () => ({ OpenAIProvider: class {}, openAIProvider: {} }));
    vi.doMock('@/lib/llm/providers/anthropic', () => ({ AnthropicProvider: class {}, anthropicProvider: {} }));
    const { ProviderRegistry } = await import('@/lib/llm/providers/registry');
    const { LLMProvider } = await import('@/lib/llm/types');
    const registry = new ProviderRegistry();
    const calls: Record<string, number> = {};
    const fake = (name: string, behaviour: Behaviour) => ({
      isAvailable: async () => true,
      getModelInfo: () => ({ provider: name, modelName: 'm', contextWindow: 1, inputCostPer1k: 0, outputCostPer1k: 0 }),
      generateContent: async () => {
        calls[name] = (calls[name] ?? 0) + 1;
        const r = await behaviour();
        return { ...r, provider: name, model: 'm' };
      },
    });
    registry.register(LLMProvider.GOOGLE_AI, fake('google', behaviours.google!) as never, 0);
    registry.register(LLMProvider.OPENAI, fake('openai', behaviours.openai!) as never, 1);
    registry.register(LLMProvider.ANTHROPIC, fake('anthropic', behaviours.anthropic!) as never, 2);
    return { registry, calls, LLMProvider };
  }

  const throwing = (status: number, headers?: Record<string, string>) => async () => {
    throw httpError(status, `HTTP ${status}`, headers);
  };
  const ok = (text: string) => async () => ({ text });

  it('429 on primary (retry-after honoured, capped) → falls back to next provider; each provider tried at most once', async () => {
    const { registry, calls } = await registryWith({
      google: throwing(429, { 'retry-after': '0' }),
      openai: ok('from-openai'),
      anthropic: ok('from-anthropic'),
    });
    const res = await registry.generateWithFallback({ input: 'x' } as never);
    expect(res.success).toBe(true);
    expect(res.response?.text).toBe('from-openai');
    expect(res.attemptsMade.map((a) => a.provider)).toEqual(['google-ai', 'openai']);
    expect(calls).toEqual({ google: 1, openai: 1 });
  });

  it('5xx on every provider → bounded to exactly one attempt per provider, then success:false with TRANSIENT classification', async () => {
    const { registry, calls } = await registryWith({
      google: throwing(503),
      openai: throwing(502),
      anthropic: throwing(500),
    });
    const res = await registry.generateWithFallback({ input: 'x' } as never);
    expect(res.success).toBe(false);
    expect(res.attemptsMade).toHaveLength(3);
    expect(calls).toEqual({ google: 1, openai: 1, anthropic: 1 });
    expect(res.error?.type).toBe('transient');
    expect(res.error?.retryable).toBe(true);
  });

  it('400 (permanent, shouldFallback=false) stops the chain after the first provider', async () => {
    const { registry, calls } = await registryWith({
      google: throwing(400),
      openai: ok('should-not-run'),
      anthropic: ok('should-not-run'),
    });
    const res = await registry.generateWithFallback({ input: 'x' } as never);
    expect(res.success).toBe(false);
    expect(res.attemptsMade).toHaveLength(1);
    expect(calls).toEqual({ google: 1 });
    expect(res.error?.type).toBe('permanent');
  });

  it('401/403 (permanent, shouldFallback=true) skips to the next provider', async () => {
    const { registry, calls } = await registryWith({
      google: throwing(401),
      openai: ok('from-openai'),
      anthropic: ok('n/a'),
    });
    const res = await registry.generateWithFallback({ input: 'x' } as never);
    expect(res.success).toBe(true);
    expect(res.response?.text).toBe('from-openai');
    expect(calls).toEqual({ google: 1, openai: 1 });
  });

  it('a provider is marked unhealthy after 3 consecutive failures and is excluded from later chains (degrade, not retry-storm)', async () => {
    const { registry, calls } = await registryWith({
      google: throwing(503),
      openai: ok('from-openai'),
      anthropic: ok('n/a'),
    });
    for (let i = 0; i < 3; i++) {
      const res = await registry.generateWithFallback({ input: 'x' } as never);
      expect(res.success).toBe(true);
    }
    expect(calls.google).toBe(3);
    const google = registry.getHealthStatus().find((h) => h.provider === 'google-ai');
    expect(google?.healthy).toBe(false);
    expect(google?.consecutiveFailures).toBe(3);

    const res = await registry.generateWithFallback({ input: 'x' } as never);
    expect(res.success).toBe(true);
    expect(res.attemptsMade.map((a) => a.provider)).toEqual(['openai']);
    expect(calls.google).toBe(3); // not called again
  });
});
