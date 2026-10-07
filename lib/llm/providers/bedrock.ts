/** Amazon Bedrock provider using the AWS SDK default credential chain. */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

import { logger } from '@/lib/logger';

import {
  LLMProvider,
  type LLMProviderInterface,
  type ProviderCallOptions,
  type ProviderModel,
  type ProviderResponse,
} from '../types';

import type { MultimodalContent } from '../provider';

const NOVA_MICRO_PROFILE = 'us.amazon.nova-micro-v1:0';
const NOVA_2_LITE_PROFILE = 'us.amazon.nova-2-lite-v1:0';
const NOVA_LITE_MODEL = 'amazon.nova-lite-v1:0';

const BEDROCK_MODELS: Record<string, ProviderModel> = {
  [NOVA_MICRO_PROFILE]: {
    provider: LLMProvider.BEDROCK,
    modelName: NOVA_MICRO_PROFILE,
    contextWindow: 128_000,
    inputCostPer1k: 0.000035,
    outputCostPer1k: 0.00014,
  },
  [NOVA_2_LITE_PROFILE]: {
    provider: LLMProvider.BEDROCK,
    modelName: NOVA_2_LITE_PROFILE,
    contextWindow: 1_000_000,
    inputCostPer1k: 0.0003,
    outputCostPer1k: 0.0025,
  },
  [NOVA_LITE_MODEL]: {
    provider: LLMProvider.BEDROCK,
    modelName: NOVA_LITE_MODEL,
    contextWindow: 300_000,
    inputCostPer1k: 0.00006,
    outputCostPer1k: 0.00024,
  },
};

function isBedrockModelId(model: string): boolean {
  return (
    model.startsWith('arn:aws:bedrock:') ||
    model.startsWith('amazon.') ||
    /^(us|eu|ap|global)\.amazon\./.test(model)
  );
}

function hasNonTextInput(input: string | MultimodalContent[]): boolean {
  return Array.isArray(input) && input.some((item) => item.type === 'image' || item.type === 'pdf');
}

function toBytes(data: string | Buffer): Uint8Array {
  if (Buffer.isBuffer(data)) return data;
  const base64 = data.match(/^data:[^;]+;base64,(.*)$/s)?.[1] ?? data;
  return Buffer.from(base64, 'base64');
}

function toImageFormat(mimeType?: string): 'png' | 'jpeg' | 'gif' | 'webp' {
  const format = mimeType?.toLowerCase().split('/')[1]?.replace('jpg', 'jpeg');
  if (format === 'png' || format === 'jpeg' || format === 'gif' || format === 'webp') {
    return format;
  }
  throw new Error(
    `Amazon Bedrock image input does not support MIME type: ${mimeType || 'unknown'}`
  );
}

function toToolSpecs(tools: any[]): any[] {
  return tools.flatMap((tool) => {
    if (tool?.toolSpec?.name) return [tool];

    if (Array.isArray(tool?.functionDeclarations)) {
      return tool.functionDeclarations.map((declaration: any) => ({
        toolSpec: {
          name: declaration.name,
          description: declaration.description,
          inputSchema: { json: declaration.parameters ?? { type: 'object', properties: {} } },
        },
      }));
    }

    if (tool?.type === 'function' && tool.function?.name) {
      return [
        {
          toolSpec: {
            name: tool.function.name,
            description: tool.function.description,
            inputSchema: { json: tool.function.parameters ?? { type: 'object', properties: {} } },
          },
        },
      ];
    }

    return [];
  });
}

export class BedrockProvider implements LLMProviderInterface {
  private client: BedrockRuntimeClient | null = null;

  private getClient(): BedrockRuntimeClient {
    if (!this.client) {
      this.client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2',
        maxAttempts: 2,
      });
    }
    return this.client;
  }

  resolveModelId(model: string, input: string | MultimodalContent[]): string {
    if (isBedrockModelId(model)) return model;
    if (hasNonTextInput(input)) {
      return process.env.BEDROCK_VISION_MODEL_ID || NOVA_2_LITE_PROFILE;
    }
    if (/pro|analysis|proposal|executive|narrative/i.test(model)) {
      return process.env.BEDROCK_MODEL_ID || NOVA_2_LITE_PROFILE;
    }
    return process.env.BEDROCK_FAST_MODEL_ID || NOVA_MICRO_PROFILE;
  }

  async isAvailable(): Promise<boolean> {
    return process.env.BEDROCK_ENABLED === 'true';
  }

  getModelInfo(modelName: string): ProviderModel {
    if (BEDROCK_MODELS[modelName]) return BEDROCK_MODELS[modelName]!;
    if (modelName.includes('nova-2-lite')) return BEDROCK_MODELS[NOVA_2_LITE_PROFILE]!;
    if (modelName.includes('nova-lite')) return BEDROCK_MODELS[NOVA_LITE_MODEL]!;
    return BEDROCK_MODELS[NOVA_MICRO_PROFILE]!;
  }

  private buildRequest(options: ProviderCallOptions): ConverseCommandInput {
    if (process.env.BEDROCK_ENABLED !== 'true') {
      throw new Error('Amazon Bedrock is disabled; set BEDROCK_ENABLED=true to enable it');
    }

    const modelId = this.resolveModelId(options.model, options.input);
    const content: any[] = [];

    if (typeof options.input === 'string') {
      content.push({ text: options.input });
    } else {
      for (const item of options.input) {
        if (item.type === 'text') {
          content.push({ text: item.data as string });
        } else if (item.type === 'image') {
          content.push({
            image: {
              format: toImageFormat(item.mimeType),
              source: { bytes: toBytes(item.data) },
            },
          });
        } else if (item.type === 'pdf') {
          content.push({
            document: {
              format: 'pdf',
              name: 'proposal-document',
              source: { bytes: toBytes(item.data) },
            },
          });
        } else {
          throw new Error(`Unsupported Bedrock content type: ${item.type}`);
        }
      }
    }

    if (options.responseModality === 'json') {
      content.push({
        text: 'Return only one valid JSON value. Do not add markdown fences or explanatory text.',
      });
    }

    const googleToolMode = options.toolConfig?.functionCallingConfig?.mode;
    const toolSpecs =
      options.tools?.length && googleToolMode !== 'NONE' ? toToolSpecs(options.tools) : [];
    const allowedNames = options.toolConfig?.functionCallingConfig?.allowedFunctionNames;
    const toolChoice =
      allowedNames?.length === 1
        ? { tool: { name: allowedNames[0] } }
        : googleToolMode === 'ANY'
          ? { any: {} }
          : googleToolMode === 'NONE'
            ? undefined
            : { auto: {} };

    const request: ConverseCommandInput = {
      modelId,
      messages: [{ role: 'user', content }],
      // Explicit Nova extended reasoning is intentionally disabled to keep output-token costs low.
      inferenceConfig: {
        temperature: options.temperature ?? 0.4,
        maxTokens: options.maxOutputTokens ?? 2048,
      },
      ...(toolSpecs.length > 0
        ? { toolConfig: { tools: toolSpecs, ...(toolChoice ? { toolChoice } : {}) } }
        : {}),
    };
    return request;
  }

  async generateContent(options: ProviderCallOptions): Promise<ProviderResponse> {
    const request = this.buildRequest(options);
    const modelId = this.resolveModelId(options.model, options.input);

    const startTime = Date.now();
    const response = await this.getClient().send(new ConverseCommand(request), {
      abortSignal: options.signal,
    });
    const latencyMs = Date.now() - startTime;
    const output = response.output?.message?.content ?? [];
    const text = output.flatMap((block) => (block.text ? [block.text] : [])).join('\n');
    const functionCalls = output.flatMap((block) =>
      block.toolUse
        ? [{ name: block.toolUse.name, args: block.toolUse.input, id: block.toolUse.toolUseId }]
        : []
    );

    logger.debug(
      {
        provider: LLMProvider.BEDROCK,
        model: modelId,
        latencyMs,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
      },
      'Amazon Bedrock API call completed'
    );

    return {
      text,
      functionCalls: functionCalls.length ? functionCalls : undefined,
      usageMetadata: {
        promptTokenCount: response.usage?.inputTokens,
        candidatesTokenCount: response.usage?.outputTokens,
      },
      provider: LLMProvider.BEDROCK,
      model: modelId,
    };
  }

  async *generateContentStream(
    options: ProviderCallOptions
  ): AsyncGenerator<string, void, unknown> {
    const request: ConverseStreamCommandInput = this.buildRequest(options);
    const response = await this.getClient().send(new ConverseStreamCommand(request), {
      abortSignal: options.signal,
    });

    for await (const event of response.stream ?? []) {
      const text = event.contentBlockDelta?.delta?.text;
      if (text) yield text;
    }
  }
}

export const bedrockProvider = new BedrockProvider();

export default bedrockProvider;
