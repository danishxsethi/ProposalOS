/**
 * Unified Gemini model access: Vertex AI (preferred) or Google AI API fallback.
 * Use when GCP/Vertex auth is not available (e.g. local dev with GOOGLE_AI_API_KEY only).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

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
