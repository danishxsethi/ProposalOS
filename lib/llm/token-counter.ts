import type { MultimodalContent } from './provider';

const IMAGE_TOKEN_ESTIMATE = 258;

export interface TokenValidationResult {
  totalTokens: number;
  isWithinBudget: boolean;
  breakdown: {
    text: number;
    images: number;
  };
  suggestion?: string;
}

export async function validateContextSize(
  modelName: string,
  content: string | MultimodalContent[],
  maxTokens?: number
): Promise<TokenValidationResult> {
  let textContent = '';
  let imageCount = 0;

  if (typeof content === 'string') {
    textContent = content;
  } else {
    for (const item of content) {
      if (item.type === 'text') {
        textContent += item.data + '\n';
      } else if (item.type === 'image') {
        imageCount++;
      }
    }
  }

  let textTokens = 0;

  if (textContent.length > 0) {
    // Bedrock Converse does not expose a preflight token-count endpoint.
    // Keep this local and approximate so validation itself never incurs inference charges.
    textTokens = Math.ceil(textContent.length / 4);
  }

  const modelContextWindow = modelName.includes('nova-micro')
    ? 128_000
    : modelName.includes('nova-lite')
      ? 300_000
      : 1_000_000;
  const contextLimit = maxTokens ?? modelContextWindow;
  const imageTokens = imageCount * IMAGE_TOKEN_ESTIMATE;
  const totalTokens = textTokens + imageTokens;

  const result: TokenValidationResult = {
    totalTokens,
    isWithinBudget: totalTokens <= contextLimit,
    breakdown: {
      text: textTokens,
      images: imageTokens,
    },
  };

  if (!result.isWithinBudget) {
    result.suggestion =
      'Context exceeds maximum threshold. Prune older evidence snapshots or remove large HTML payloads.';
  }

  return result;
}
