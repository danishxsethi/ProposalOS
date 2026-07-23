/**
 * Unified Gemini model access: Vertex AI (preferred) or Google AI API fallback.
 * Use when GCP/Vertex auth is not available (e.g. local dev with GOOGLE_AI_API_KEY only).
 *
 * Multi-Model Orchestration integration (Requirements 16.1, 16.3):
 * Use `getOrchestratedModel(taskType, requirements?)` to route through
 * `selectModel()` + `executeWithFallback()` from lib/intelligence/modelOrchestration.ts.
 * This enables dynamic routing between Claude, GPT-4o, Gemini, and Llama based on
 * task type, cost, quality, and availability with automatic failover.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  selectModel,
  executeWithFallback,
} from '@/lib/intelligence/modelOrchestration';
import type { ModelRequirements, LLMTask, LLMResponse } from '@/lib/intelligence/types';

let _vertexAvailable: boolean | null = null;

function isVertexAvailable(): boolean {
  if (_vertexAvailable !== null) return _vertexAvailable;
  const projectId = process.env.GCP_PROJECT_ID;
  const hasCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  _vertexAvailable = !!(projectId && hasCreds);
  return _vertexAvailable;
}

export async function generateWithGemini(
  modelName: string,
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ text: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY required for Gemini API fallback');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options?.temperature ?? 0.4,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = result.response?.usageMetadata;

  return {
    text,
    usageMetadata: usage
      ? {
          promptTokenCount: usage.promptTokenCount,
          candidatesTokenCount: usage.candidatesTokenCount,
        }
      : undefined,
  };
}

export function getGeminiModel(
  modelName: string,
  generationConfig?: { temperature?: number; maxOutputTokens?: number }
): {
  generateContent: (prompt: string) => Promise<{
    response: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  }>;
} {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: generationConfig?.temperature ?? 0.4,
        maxOutputTokens: generationConfig?.maxOutputTokens ?? 2048,
      },
    });

    return {
      async generateContent(prompt: string) {
        const result = await model.generateContent(prompt);
        return {
          response: result.response,
          usageMetadata: (result.response as any).usageMetadata,
        };
      },
    } as any;
  }

  if (isVertexAvailable()) {
    const { VertexAI } = require('@google-cloud/vertexai');
    const projectId = process.env.GCP_PROJECT_ID!;
    const location = process.env.GCP_REGION || 'us-central1';
    const vertexAI = new VertexAI({ project: projectId, location });
    return vertexAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: generationConfig?.temperature ?? 0.4,
        maxOutputTokens: generationConfig?.maxOutputTokens ?? 2048,
      },
    }) as any;
  }

  throw new Error('GOOGLE_AI_API_KEY or GCP_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS required');
}

// ─── Multi-Model Orchestration Integration ────────────────────────────────────

/**
 * Returns a model interface that routes through the Multi-Model Orchestration layer.
 *
 * Instead of always calling Gemini, this selects the optimal model (Claude, GPT-4o,
 * Gemini, Llama) based on task type, cost, quality, and availability, then executes
 * with automatic failover so no task fails due to a single model being unavailable.
 *
 * Requirements: 16.1, 16.3
 *
 * Usage (drop-in replacement for getGeminiModel in call sites):
 *
 *   // Before:
 *   const model = getGeminiModel('gemini-2.5-flash', { temperature: 0.5 });
 *   const result = await model.generateContent(prompt);
 *
 *   // After (with orchestration):
 *   const model = await getOrchestratedModel('email_generation');
 *   const result = await model.generateContent(prompt);
 *
 * @param taskType - Task identifier used for model selection (e.g. 'email_generation',
 *   'proposal_writing', 'diagnosis', 'audit'). Maps to benchmarks in ModelBenchmark table.
 * @param requirements - Optional quality/cost/latency constraints. Defaults to balanced settings.
 * @param options - Generation options forwarded to the underlying model call.
 */
export async function getOrchestratedModel(
  taskType: string,
  requirements?: Partial<ModelRequirements>,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{
  generateContent: (prompt: string) => Promise<{
    response: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  }>;
}> {
  const modelRequirements: ModelRequirements = {
    minQuality: requirements?.minQuality ?? 70,
    maxLatency: requirements?.maxLatency ?? 10000,
    maxCost: requirements?.maxCost ?? 1,
    preferredProvider: requirements?.preferredProvider,
  };

  const routing = await selectModel(taskType, modelRequirements);

  return {
    async generateContent(prompt: string) {
      const task: LLMTask = {
        taskType,
        prompt,
        maxTokens: options?.maxOutputTokens ?? 2048,
        temperature: options?.temperature ?? 0.4,
      };

      // executeWithFallback iterates through selectedModel + fallbackModels until success.
      // For Gemini-backed tasks, the defaultModelCall stub is used; swap in real API
      // callers per-model by passing a custom callModel function here when integrating
      // with live OpenAI/Anthropic/Google SDKs.
      const response: LLMResponse = await executeWithFallback(task, routing);

      // Normalise to the same shape as getGeminiModel so call sites are drop-in compatible.
      return {
        response: {
          candidates: [
            {
              content: {
                parts: [{ text: response.content }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: Math.round(response.tokensUsed * 0.6),
            candidatesTokenCount: Math.round(response.tokensUsed * 0.4),
          },
        },
        usageMetadata: {
          promptTokenCount: Math.round(response.tokensUsed * 0.6),
          candidatesTokenCount: Math.round(response.tokensUsed * 0.4),
        },
      };
    },
  };
}
