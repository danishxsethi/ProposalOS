/**
 * FIX-35: LLM provider fallback chain.
 * Gemini → Anthropic → OpenAI, with automatic retry and logging.
 *
 * Usage: import { generateWithFallback } from '@/lib/llm/providerFallback'
 * and replace direct generateWithGemini() calls where resilience matters.
 */

import { logger } from '@/lib/logger';

export interface LLMRequest {
    prompt: string;
    maxOutputTokens?: number;
    temperature?: number;
    systemInstruction?: string;
}

export interface LLMResponse {
    text: string;
    provider: string;
    inputTokens?: number;
    outputTokens?: number;
}

// ── Gemini Provider ────────────────────────────────────────────────────────────
async function callGemini(req: LLMRequest): Promise<LLMResponse> {
    const { generateWithGemini } = await import('./provider');
    const text = await generateWithGemini(req.prompt, {
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature,
        systemInstruction: req.systemInstruction,
    });
    return { text, provider: 'gemini' };
}

// ── Anthropic Provider ─────────────────────────────────────────────────────────
async function callAnthropic(req: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: req.prompt },
    ];

    const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: req.maxOutputTokens ?? 2048,
        system: req.systemInstruction,
        messages,
    });

    const text = response.content
        .filter(c => c.type === 'text')
        .map(c => (c as any).text)
        .join('');

    return {
        text,
        provider: 'anthropic',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    };
}

// ── OpenAI Provider ─────────────────────────────────────────────────────────────
async function callOpenAI(req: LLMRequest): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (req.systemInstruction) {
        messages.push({ role: 'system', content: req.systemInstruction });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: req.maxOutputTokens ?? 2048,
        temperature: req.temperature ?? 1,
    });

    const text = response.choices[0]?.message?.content ?? '';
    return {
        text,
        provider: 'openai',
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
    };
}

type LLMProvider = 'gemini' | 'anthropic' | 'openai';

const PROVIDERS: Array<(req: LLMRequest) => Promise<LLMResponse>> = [
    callGemini,
    callAnthropic,
    callOpenAI,
];

const PROVIDER_NAMES: LLMProvider[] = ['gemini', 'anthropic', 'openai'];

/**
 * Executes a request with automatic provider fallback.
 * Gemini is tried first; on failure falls back to Anthropic then OpenAI.
 */
export async function generateWithFallback(req: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];

    for (let i = 0; i < PROVIDERS.length; i++) {
        const providerName = PROVIDER_NAMES[i];
        try {
            const result = await PROVIDERS[i](req);
            if (i > 0) {
                logger.warn({ provider: result.provider, fallbackAttempt: i }, 'LLM fallback provider used');
            }
            return result;
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            errors.push(`${providerName}: ${msg}`);
            logger.error({ provider: providerName, err: msg }, `LLM provider failed, trying next`);
        }
    }

    throw new Error(`All LLM providers failed:\n${errors.join('\n')}`);
}
