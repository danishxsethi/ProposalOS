/**
 * Centralized LLM Model Configuration
 *
 * All model selections should be configured here, not hardcoded in individual files.
 * This enables easy model switching, A/B testing, and cost optimization.
 */

/** Bedrock model IDs used by the ProposalOS runtime. */
export const BEDROCK_NOVA_MICRO = process.env.BEDROCK_FAST_MODEL_ID || 'us.amazon.nova-micro-v1:0';
export const BEDROCK_NOVA_2_LITE = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-2-lite-v1:0';
export const BEDROCK_NOVA_MULTIMODAL = process.env.BEDROCK_VISION_MODEL_ID || BEDROCK_NOVA_2_LITE;

const BEDROCK_MODEL_ID_PATTERN = /^(?:arn:aws:bedrock:|(?:us|eu|ap|global)\.amazon\.|amazon\.)/;

/** Accept Bedrock-native overrides and ignore model IDs from retired providers. */
function configuredBedrockModel(value: string | undefined, fallback: string): string {
  return value && BEDROCK_MODEL_ID_PATTERN.test(value) ? value : fallback;
}

export interface ModelConfig {
  model: string;
  thinkingBudget?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AllModelConfig {
  // Task-specific models
  diagnosis: ModelConfig;
  proposal: ModelConfig;
  flash: ModelConfig;

  // Email generation
  email: ModelConfig;
  emailFollowUp: ModelConfig;

  // Chat/Sales
  chat: ModelConfig;
  salesChat: ModelConfig;

  // Multimodal (image analysis)
  multimodal: ModelConfig;

  // Localization
  localization: ModelConfig;
  translation: ModelConfig;

  // Clustering and analysis
  clustering: ModelConfig;
  analysis: ModelConfig;

  // Executive summary
  executiveSummary: ModelConfig;

  // Pricing generation
  pricing: ModelConfig;
}

export const MODEL_CONFIG: AllModelConfig = {
  // === Core Models ===
  diagnosis: {
    model: configuredBedrockModel(process.env.LLM_MODEL_DIAGNOSIS, BEDROCK_NOVA_2_LITE),
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_DIAGNOSIS || '0'),
  },
  proposal: {
    model: configuredBedrockModel(process.env.LLM_MODEL_PROPOSAL, BEDROCK_NOVA_2_LITE),
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_PROPOSAL || '0'),
  },
  flash: {
    model: configuredBedrockModel(process.env.LLM_MODEL_FLASH, BEDROCK_NOVA_MICRO),
    thinkingBudget: 0,
  },

  // === Email Models ===
  email: {
    model: configuredBedrockModel(process.env.LLM_MODEL_EMAIL, BEDROCK_NOVA_MICRO),
    temperature: 0.7,
    maxOutputTokens: 512,
  },
  emailFollowUp: {
    model: configuredBedrockModel(process.env.LLM_MODEL_EMAIL_FOLLOWUP, BEDROCK_NOVA_MICRO),
    temperature: 0.8,
    maxOutputTokens: 512,
  },

  // === Chat/Sales Models ===
  chat: {
    model: configuredBedrockModel(process.env.LLM_MODEL_CHAT, BEDROCK_NOVA_MICRO),
    temperature: 0.7,
    maxOutputTokens: 1024,
  },
  salesChat: {
    model: configuredBedrockModel(process.env.LLM_MODEL_SALES_CHAT, BEDROCK_NOVA_MICRO),
    temperature: 0.6,
    maxOutputTokens: 1024,
  },

  // === Multimodal Models ===
  multimodal: {
    model: configuredBedrockModel(process.env.LLM_MODEL_MULTIMODAL, BEDROCK_NOVA_MULTIMODAL),
    thinkingBudget: 0,
  },

  // === Localization Models ===
  localization: {
    model: configuredBedrockModel(process.env.LLM_MODEL_LOCALIZATION, BEDROCK_NOVA_MICRO),
    temperature: 0.3,
  },
  translation: {
    model: configuredBedrockModel(process.env.LLM_MODEL_TRANSLATION, BEDROCK_NOVA_MICRO),
    temperature: 0.3,
  },

  // === Analysis Models ===
  clustering: {
    model: configuredBedrockModel(process.env.LLM_MODEL_CLUSTERING, BEDROCK_NOVA_MICRO),
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_CLUSTERING || '0'),
  },
  analysis: {
    model: configuredBedrockModel(process.env.LLM_MODEL_ANALYSIS, BEDROCK_NOVA_2_LITE),
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_ANALYSIS || '0'),
  },

  // === Executive Summary ===
  executiveSummary: {
    model: configuredBedrockModel(process.env.LLM_MODEL_EXEC_SUMMARY, BEDROCK_NOVA_2_LITE),
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_EXEC_SUMMARY || '0'),
    temperature: 0.3,
  },

  // === Pricing Generation ===
  pricing: {
    model: configuredBedrockModel(process.env.LLM_MODEL_PRICING, BEDROCK_NOVA_MICRO),
    temperature: 0.2,
    maxOutputTokens: 512,
  },
} as const;

/**
 * Get model for a specific task
 */
export function getModelForTask(task: keyof AllModelConfig): string {
  return MODEL_CONFIG[task].model;
}

/**
 * Get full config for a specific task
 */
export function getConfigForTask(task: keyof AllModelConfig): ModelConfig {
  return MODEL_CONFIG[task];
}

/**
 * Check if a model is a "flash" class (fast, cheap) model
 */
export function isFlashModel(modelName: string): boolean {
  return modelName.includes('nova-micro');
}

/**
 * Check if a model is a "pro" class (powerful, expensive) model
 */
export function isProModel(modelName: string): boolean {
  return modelName.includes('nova-2-lite') || modelName.includes('nova-pro');
}
