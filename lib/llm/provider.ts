import { GoogleGenerativeAI } from '@google/generative-ai';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { PromptPerformanceTracker } from '@/lib/self-evolving-prompts/PromptPerformanceTracker';
import { MetricsRecorder } from '@/lib/observability/MetricsRecorder';

/**
 * Task 1 (Pipeline 16): Token budget enforcement errors.
 */
export class BudgetExceededError extends Error {
    constructor(public estimatedTokens: number, public contextWindow: number, public model: string) {
        super(`[BudgetExceededError] ${model}: estimated ${estimatedTokens} tokens exceeds context window of ${contextWindow}`);
        this.name = 'BudgetExceededError';
    }
}

/** Context windows for supported models (tokens). */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    default: 1_000_000,
    'gemini-2.0-flash': 1_000_000,
    'gemini-2.0-pro': 1_000_000,
    'gemini-2.0-pro-exp-01-21': 1_000_000,
    'gemini-1.5-pro': 1_000_000,
    'gemini-1.5-flash': 1_000_000,
    'gemini-3.1-pro': 1_000_000,
};

function getContextWindow(model: string): number {
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (model.includes(key) || key === 'default') return limit;
    }
    return MODEL_CONTEXT_WINDOWS.default;
}

const performanceTracker = new PromptPerformanceTracker();

let _vertexAvailable: boolean | null = null;

function isVertexAvailable(): boolean {
    if (_vertexAvailable !== null) return _vertexAvailable;
    const projectId = process.env.GCP_PROJECT_ID;
    const hasCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    _vertexAvailable = !!(projectId && hasCreds);
    return _vertexAvailable;
}

export interface MultimodalContent {
    type: 'text' | 'image' | 'pdf';
    data: string | Buffer;     // text content or binary
    mimeType?: string;
}

export interface LLMCallOptions {
    model: string;              // from env var, not hardcoded
    input: string | MultimodalContent[];
    thinkingBudget?: number;    // tokens for reasoning (0 = disabled)
    maxOutputTokens?: number;
    temperature?: number;
    stream?: boolean;           // enable streaming
    responseModality?: 'text' | 'json' | 'multimodal';
    tools?: any[];
    toolConfig?: any;
    metadata?: {
        node?: string;             // which pipeline node is calling
        auditId?: string;          // for cost tracking
        qaScore?: number;          // downstream QA gate score (0–1), overrides quality heuristic
        experimentId?: string;     // A/B experiment name
        variantId?: string;        // 'control' | 'variant'
    };
}

export async function generateWithGemini(
    optionsOrModelName: LLMCallOptions | string,
    prompt?: string,
    legacyOptions?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ text: string; functionCalls?: any[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }> {
    let opts: LLMCallOptions;

    if (typeof optionsOrModelName === 'string') {
        // Legacy support
        opts = {
            model: optionsOrModelName,
            input: prompt || '',
            temperature: legacyOptions?.temperature,
            maxOutputTokens: legacyOptions?.maxOutputTokens,
            stream: false
        };
    } else {
        opts = optionsOrModelName;
    }

    const generationConfig: any = {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
    };

    if (opts.responseModality === 'json') {
        generationConfig.responseMimeType = 'application/json';
    }

    if (opts.thinkingBudget && opts.thinkingBudget > 0 && !opts.model.includes('flash')) {
        generationConfig.thinkingConfig = {
            thinkingBudget: opts.thinkingBudget
        };
    }

    // Format input parts for multimodal
    let contents = [];
    if (typeof opts.input === 'string') {
        contents = [{ role: 'user', parts: [{ text: opts.input }] }];
    } else {
        const parts = opts.input.map(content => {
            if (content.type === 'text') {
                return { text: content.data as string };
            } else {
                const base64Data = Buffer.isBuffer(content.data)
                    ? content.data.toString('base64')
                    : content.data;

                return {
                    inlineData: {
                        data: base64Data,
                        mimeType: content.mimeType || 'image/png'
                    }
                };
            }
        });
        contents = [{ role: 'user', parts }];
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey && !isVertexAvailable()) {
        throw new Error('GOOGLE_AI_API_KEY or GCP_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS required');
    }

    let targetModel = opts.model;

    // Model Config Override for 3.1 Pro Canary
    if (opts.metadata?.auditId && FEATURE_FLAGS.GEMINI_31_PRO_ENABLED && FEATURE_FLAGS.GEMINI_31_PRO_TRAFFIC_PCT > 0) {
        const hashBuffer = crypto.createHash('sha256').update(opts.metadata.auditId).digest();
        const hashInt = hashBuffer.readUInt32BE(0);
        const bucket = hashInt % 100;

        if (bucket < FEATURE_FLAGS.GEMINI_31_PRO_TRAFFIC_PCT) {
            targetModel = 'gemini-3.1-pro';
        }
    }

    let model: any;

    if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: targetModel,
            generationConfig,
            tools: opts.tools,
            toolConfig: opts.toolConfig,
        });
    } else {
        const { VertexAI } = require('@google-cloud/vertexai');
        const projectId = process.env.GCP_PROJECT_ID!;
        const location = process.env.GCP_REGION || 'us-central1';
        const vertexAI = new VertexAI({ project: projectId, location });
        model = vertexAI.getGenerativeModel({
            model: targetModel,
            generationConfig,
            tools: opts.tools,
            toolConfig: opts.toolConfig,
        });
    }

    if (opts.stream) {
        const result = await model.generateContentStream({ contents });
        // We will return the text stream and usage, or we can just compile it. 
        // The spec asks for returning an AsyncGenerator if stream is true. Let's handle streamToString.
        // For backwards compatibility, if they pass stream but expect string:
        throw new Error("Streaming enabled: But please use streamToString or handle AsyncGenerator directly on the client. Not implemented in legacy return signature.");
    }

    // ── Task 1 (Pipeline 16): Token Budget Validator ────────────────────────
    const inputLengthChars = Array.isArray(opts.input)
        ? opts.input.reduce((acc, c) => acc + (typeof c.data === 'string' ? c.data.length : 1000), 0)
        : (opts.input as string).length;
    const estimatedInputTokens = Math.ceil(inputLengthChars / 4);
    const maxOutputTokens = opts.maxOutputTokens ?? 2048;
    const contextWindow = getContextWindow(targetModel);
    const totalEstimated = estimatedInputTokens + maxOutputTokens;

    if (totalEstimated > contextWindow) {
        // Hard reject: over 100% of context window
        logger.error({ model: targetModel, estimatedInputTokens, maxOutputTokens, contextWindow }, 'Token budget hard limit exceeded — rejecting call');
        throw new BudgetExceededError(totalEstimated, contextWindow, targetModel);
    }

    if (totalEstimated > contextWindow * 0.9) {
        // Soft limit at 90%: truncate input by 20% and warn
        const targetInputChars = Math.floor((contextWindow * 0.85 - maxOutputTokens) * 4);
        logger.warn({ model: targetModel, estimatedInputTokens, contextWindow }, 'Token budget at 90% — truncating input');
        if (typeof opts.input === 'string' && opts.input.length > targetInputChars) {
            opts = { ...opts, input: opts.input.slice(0, targetInputChars) + '\n[TRUNCATED: input exceeded 90% of context window]' };
        }
        // Re-format contents after truncation
        if (typeof opts.input === 'string') {
            contents = [{ role: 'user', parts: [{ text: opts.input }] }];
        }
    }
    // ── End Token Budget Validator ──────────────────────────────────────────

    const startTime = performance.now();
    const result = await model.generateContent({ contents });
    const endTime = performance.now();
    const response = result.response;

    // Try to safely extract text from Gemini response structure
    let text = '';
    let functionCalls: any[] | undefined = undefined;

    if (response.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts;
        const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
        if (textParts.length > 0) text = textParts.join('\\n');

        const fcs = parts.filter((p: any) => !!p.functionCall).map((p: any) => p.functionCall);
        if (fcs.length > 0) functionCalls = fcs;
    } else if (response.functionCalls && typeof response.functionCalls === 'function') {
        const fcs = response.functionCalls();
        if (fcs && fcs.length > 0) functionCalls = fcs;
        if (response.text && typeof response.text === 'function') {
            try { text = response.text(); } catch (e) { }
        }
    } else if (response.text && typeof response.text === 'function') {
        try { text = response.text(); } catch (e) { }
    }

    const usage = (result.response as any).usageMetadata;

    if (usage && usage.thoughtsTokenCount) {
        const thinkingDurationMs = (usage.thoughtsTokenCount / 50) * 1000;
        logger.info({ thinkingDurationMs, node: opts.metadata?.node }, 'Thinking mode executed');
    }

    // Compute token counts + cost FIRST so they are available to heuristic block below
    const inputTokens = usage?.promptTokenCount || estimatedInputTokens;
    const outputTokens = usage?.candidatesTokenCount || 0;
    const costUSD = (inputTokens / 1000000) * 1.25 + (outputTokens / 1000000) * 3.75;

    // Task 1: Compute quality heuristic before logging
    // - JSON parse success for structured outputs scores highest
    // - Output length ratio vs input gives a proxy for informativeness
    // - qaScore from downstream gate overrides everything if present
    const qaScore = opts.metadata?.qaScore as number | undefined;
    let outputQualityScore: number;
    if (typeof qaScore === 'number') {
        // Use downstream QA gate score directly (1 - hallucination score)
        outputQualityScore = Math.max(0, 1 - qaScore);
    } else if (opts.responseModality === 'json') {
        try { JSON.parse(text); outputQualityScore = 0.9; } catch { outputQualityScore = 0.3; }
    } else {
        const inputLen = typeof opts.input === 'string' ? opts.input.length : 2000;
        const ratio = text.length / Math.max(1, inputLen);
        outputQualityScore = Math.min(1.0, Math.max(0.1, ratio * 2));
    }

    // Task 1: Tag with A/B variant so we know which variant produced the result
    const experimentId = opts.metadata?.experimentId as string | undefined;
    const variantId = opts.metadata?.variantId as string | undefined;
    // Deterministic variant hash if auditId present but no explicit variant
    const promptVersionHash = variantId
        ? `${opts.metadata?.node || 'unknown'}:${variantId}`
        : opts.metadata?.auditId
            ? crypto.createHash('sha256').update((opts.metadata?.node || 'unknown') + (opts.metadata?.auditId || '')).digest('hex').slice(0, 16)
            : 'default';

    performanceTracker.logPerformance({
        promptVersionHash,
        nodeId: opts.metadata?.node || 'unknown-node',
        qualityScore: outputQualityScore,
        downstreamImpact: 0,
        costUSD,
        latencyMs: endTime - startTime,
        inputTokens,
        outputTokens,
        experimentId: experimentId || undefined,
        variantId: variantId || undefined,
        metadata: {
            model: targetModel,
            budgetCheckPassed: true,
            heuristicType: qaScore !== undefined ? 'qa-gate' : opts.responseModality === 'json' ? 'json-parse' : 'length-ratio',
        },
    }).catch(err => logger.error({ err }, 'Telemetry logging failed'));

    // Task 3 (Pipeline 17): Persist metrics for observability dashboard + alert rules
    MetricsRecorder.llmCall(endTime - startTime, costUSD, targetModel, opts.metadata?.node || 'unknown-node');


    return {
        text,
        functionCalls,
        usageMetadata: usage
            ? {
                promptTokenCount: usage.promptTokenCount,
                candidatesTokenCount: usage.candidatesTokenCount,
                thoughtsTokenCount: usage.thoughtsTokenCount // Example path, depends on SDK version parsing
            }
            : undefined,
    };
}

// Generate Async Generator
export async function* generateContentStream(opts: LLMCallOptions): AsyncGenerator<string, void, unknown> {
    const generationConfig: any = {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
    };

    if (opts.thinkingBudget && opts.thinkingBudget > 0 && !opts.model.includes('flash')) {
        generationConfig.thinkingConfig = {
            thinkingBudget: opts.thinkingBudget
        };
    }

    let contents = [];
    if (typeof opts.input === 'string') {
        contents = [{ role: 'user', parts: [{ text: opts.input }] }];
    } else {
        const parts = opts.input.map(content => {
            if (content.type === 'text') {
                return { text: content.data as string };
            } else {
                const base64Data = Buffer.isBuffer(content.data)
                    ? content.data.toString('base64')
                    : content.data;

                return {
                    inlineData: {
                        data: base64Data,
                        mimeType: content.mimeType || 'image/png'
                    }
                };
            }
        });
        contents = [{ role: 'user', parts }];
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let model;

    if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({ model: opts.model, generationConfig });
    } else {
        const { VertexAI } = require('@google-cloud/vertexai');
        const projectId = process.env.GCP_PROJECT_ID!;
        const location = process.env.GCP_REGION || 'us-central1';
        const vertexAI = new VertexAI({ project: projectId, location });
        model = vertexAI.getGenerativeModel({ model: opts.model, generationConfig });
    }

    const resultStream = await model.generateContentStream({ contents });
    for await (const chunk of resultStream.stream) {
        yield chunk.text();
    }
}

export async function streamToString(stream: AsyncGenerator<string>): Promise<string> {
    let result = '';
    for await (const chunk of stream) {
        result += chunk;
    }
    return result;
}
