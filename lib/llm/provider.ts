import { GoogleGenerativeAI } from '@google/generative-ai';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { logger } from '@/lib/logger';
import { PiiScrubber } from '@/lib/security/piiScrubber';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { validateTokenBudget } from './tokenBudgetValidator';
import { RunTree, Client } from 'langsmith';

export async function logFeedbackToLangsmith(runId: string, score: number, comment?: string) {
    if (!process.env.LANGCHAIN_API_KEY) return;
    try {
        const client = new Client();
        await client.createFeedback(runId, "user_score", {
            score,
            comment,
        });
        logger.info({ runId, score }, 'Logged feedback to LangSmith');
    } catch (err) {
        logger.warn({ runId, err }, 'Failed to log feedback to LangSmith');
    }
}

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
    tenantId?: string;          // needed for token bucket rate limits
    thinkingBudget?: number;    // tokens for reasoning (0 = disabled)
    maxOutputTokens?: number;
    temperature?: number;
    stream?: boolean;           // enable streaming
    responseModality?: 'text' | 'json' | 'multimodal';
    metadata?: {
        node?: string;             // which pipeline node is calling
        auditId?: string;          // for cost tracking
    };
}

export async function generateWithGemini(
    optionsOrModelName: LLMCallOptions | string,
    prompt?: string,
    legacyOptions?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ text: string; runId?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }> {
    let opts: LLMCallOptions;

    if (typeof optionsOrModelName === 'string') {
        // Legacy support
        opts = {
            model: optionsOrModelName,
            input: prompt || '',
            tenantId: 'system', // fallback
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

    // Cost Control 2A: Token Bucket Rate Limiting
    const tenantId = opts.tenantId || 'system';
    // Validate limits directly mapped to models 
    const isPro = opts.model.includes('pro');
    const limitKey = isPro ? 'gemini-3.1-pro' : 'gemini-3.1-flash';
    const limiter = checkRateLimit(tenantId, limitKey);

    if (!limiter.allowed) {
        throw new Error(`Rate limit exceeded for model ${limitKey} by tenant ${tenantId}. Retry after ${Math.ceil(limiter.retryAfterMs / 1000)}s.`);
    }

    // Cost Control 2B: Token Budget Pre-flight Validator
    const budgetCheck = validateTokenBudget(opts, limitKey);
    if (!budgetCheck.valid) {
        logger.error(`Token budget validation failed for ${limitKey} - ${JSON.stringify({ tenantId, reason: budgetCheck.reason, estimatedTokens: budgetCheck.estimatedTokens })}`);
        throw new Error(`LLM Payload Rejected: ${budgetCheck.reason}`);
    }

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
        contents = [{ role: 'user', parts: [{ text: PiiScrubber.sanitize(opts.input) }] }];
    } else {
        const parts = opts.input.map(content => {
            if (content.type === 'text') {
                return { text: PiiScrubber.sanitize(content.data as string) };
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
        // Simple hash function for Edge compatibility instead of crypto
        let hashInt = 0;
        for (let i = 0; i < opts.metadata.auditId.length; i++) {
            hashInt = Math.imul(31, hashInt) + opts.metadata.auditId.charCodeAt(i) | 0;
        }
        // Ensure positive modulo
        const bucket = Math.abs(hashInt) % 100;

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
        });
    } else {
        const { VertexAI } = require('@google-cloud/vertexai');
        const projectId = process.env.GCP_PROJECT_ID!;
        const location = process.env.GCP_REGION || 'us-central1';
        const vertexAI = new VertexAI({ project: projectId, location });
        model = vertexAI.getGenerativeModel({
            model: targetModel,
            generationConfig,
        });
    }

    if (opts.stream) {
        const result = await model.generateContentStream({ contents });
        // We will return the text stream and usage, or we can just compile it. 
        // The spec asks for returning an AsyncGenerator if stream is true. Let's handle streamToString.
        // For backwards compatibility, if they pass stream but expect string:
        throw new Error("Streaming enabled: But please use streamToString or handle AsyncGenerator directly on the client. Not implemented in legacy return signature.");
    }

    let runTree: RunTree | undefined;
    if (process.env.LANGCHAIN_API_KEY) {
        try {
            runTree = new RunTree({
                name: opts.metadata?.node || "generateWithGemini",
                run_type: "llm",
                inputs: { contents },
                extra: { metadata: opts.metadata, model: targetModel },
            });
            await runTree.postRun();
        } catch (e) {
            logger.warn({ err: e }, 'Failed to initialize LangSmith run tree');
        }
    }

    const result = await model.generateContent({ contents });
    const response = result.response;

    // Try to safely extract text from Gemini response structure
    let text = '';
    if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = response.candidates[0].content.parts[0].text;
    } else if (response.text && typeof response.text === 'function') {
        text = response.text();
    }

    if (text) {
        text = PiiScrubber.restore(text);
    }

    const usage = (result.response as any).usageMetadata;

    if (usage && usage.thoughtsTokenCount) {
        const thinkingDurationMs = (usage.thoughtsTokenCount / 50) * 1000;
        logger.info({ thinkingDurationMs, node: opts.metadata?.node }, 'Thinking mode executed');
    }

    if (runTree) {
        try {
            await runTree.end({
                outputs: { text },
            });
            await runTree.patchRun();
        } catch (e) {
            logger.warn({ err: e }, 'Failed to finalize LangSmith run tree');
        }
    }

    return {
        text,
        runId: runTree?.id,
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
        contents = [{ role: 'user', parts: [{ text: PiiScrubber.sanitize(opts.input) }] }];
    } else {
        const parts = opts.input.map(content => {
            if (content.type === 'text') {
                return { text: PiiScrubber.sanitize(content.data as string) };
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
        if (chunk.text()) {
            yield PiiScrubber.restore(chunk.text());
        }
    }
}

export async function streamToString(stream: AsyncGenerator<string>): Promise<string> {
    let result = '';
    for await (const chunk of stream) {
        result += chunk;
    }
    return result;
}
