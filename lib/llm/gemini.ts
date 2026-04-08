/**
 * @deprecated This file is deprecated and will be removed in a future version.
 *
 * Please use the enhanced provider abstraction instead:
 * - For direct Gemini calls: import { generateWithGemini } from '@/lib/llm/provider';
 * - For multi-provider with fallback: import { providerRegistry } from '@/lib/llm/providers/registry';
 *
 * This legacy file is kept for backward compatibility only.
 */

import { logger } from '@/lib/logger';

import { generateWithGemini as newGenerateWithGemini } from './provider';

/**
 * @deprecated Use generateWithGemini from '@/lib/llm/provider' instead
 *
 * Legacy support - redirects to the enhanced provider implementation.
 * Logs a deprecation warning on each call.
 */
export async function generateWithGemini(
  modelName: string,
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{
  text: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}> {
  logger.warn(
    { callSite: 'lib/llm/gemini.ts:generateWithGemini' },
    'DEPRECATED: generateWithGemini from lib/llm/gemini.ts is deprecated. Use generateWithGemini from lib/llm/provider instead.'
  );

  const result = await newGenerateWithGemini({
    model: modelName,
    input: prompt,
    temperature: options?.temperature,
    maxOutputTokens: options?.maxOutputTokens,
  });

  return {
    text: result.text,
    usageMetadata: result.usageMetadata
      ? {
          promptTokenCount: result.usageMetadata.promptTokenCount,
          candidatesTokenCount: result.usageMetadata.candidatesTokenCount,
        }
      : undefined,
  };
}

/**
 * @deprecated Use generateWithGemini from '@/lib/llm/provider' instead
 */
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
  logger.warn(
    { callSite: 'lib/llm/gemini.ts:getGeminiModel' },
    'DEPRECATED: getGeminiModel from lib/llm/gemini.ts is deprecated. Use generateWithGemini from lib/llm/provider instead.'
  );

  return {
    async generateContent(prompt: string) {
      const result = await newGenerateWithGemini({
        model: modelName,
        input: prompt,
        temperature: generationConfig?.temperature,
        maxOutputTokens: generationConfig?.maxOutputTokens,
      });

      return {
        response: {
          candidates: result.text
            ? [
                {
                  content: {
                    parts: [{ text: result.text }],
                  },
                },
              ]
            : [],
          usageMetadata: result.usageMetadata,
        },
        usageMetadata: result.usageMetadata,
      };
    },
  };
}

// Note: isVertexAvailable is internal to provider.ts and not re-exported
// If you need this functionality, please use the new provider abstraction
