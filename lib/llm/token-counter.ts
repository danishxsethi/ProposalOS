import { GoogleGenerativeAI } from '@google/generative-ai';
import { MultimodalContent } from './provider';

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
    maxTokens: number = 1000000
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
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (apiKey) {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });
            try {
                const result = await model.countTokens(textContent);
                textTokens = result.totalTokens;
            } catch (err) {
                // Fallback rough estimate: 1 token ~= 4 chars
                textTokens = Math.ceil(textContent.length / 4);
            }
        } else {
            textTokens = Math.ceil(textContent.length / 4);
        }
    }

    const imageTokens = imageCount * IMAGE_TOKEN_ESTIMATE;
    const totalTokens = textTokens + imageTokens;

    const result: TokenValidationResult = {
        totalTokens,
        isWithinBudget: totalTokens <= maxTokens,
        breakdown: {
            text: textTokens,
            images: imageTokens,
        }
    };

    if (!result.isWithinBudget) {
        result.suggestion = 'Context exceeds maximum threshold. Prune older evidence snapshots or remove large HTML payloads.';
    }

    return result;
}
