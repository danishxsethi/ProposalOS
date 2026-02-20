import { GoogleGenerativeAI } from '@google/generative-ai';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

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
    metadata?: {
        node?: string;             // which pipeline node is calling
        auditId?: string;          // for cost tracking
    };
}

export async function generateWithGemini(
    optionsOrModelName: LLMCallOptions | string,
    prompt?: string,
    legacyOptions?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ text: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }> {
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

    const result = await model.generateContent({ contents });
    const response = result.response;

    // Try to safely extract text from Gemini response structure
    let text = '';
    if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = response.candidates[0].content.parts[0].text;
    } else if (response.text && typeof response.text === 'function') {
        text = response.text();
    }

    const usage = (result.response as any).usageMetadata;

    if (usage && usage.thoughtsTokenCount) {
        const thinkingDurationMs = (usage.thoughtsTokenCount / 50) * 1000;
        logger.info({ thinkingDurationMs, node: opts.metadata?.node }, 'Thinking mode executed');
    }

    return {
        text,
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
