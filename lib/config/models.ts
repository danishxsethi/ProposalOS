/**
 * Centralized LLM Model Configuration
 *
 * All model selections should be configured here, not hardcoded in individual files.
 * This enables easy model switching, A/B testing, and cost optimization.
 */

/**
 * Canonical Gemini model IDs. The 1.5 / 2.0 generation was retired by Google
 * (generateContent returns 404 "no longer available"); every default below and
 * every call site must resolve through these constants so a model retirement is
 * a one-line change, not a production outage. Override per task with
 * LLM_MODEL_* env vars; override the generation with GEMINI_FLASH_MODEL /
 * GEMINI_PRO_MODEL.
 */
export const GEMINI_FLASH = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
export const GEMINI_PRO = process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro';
export const GEMINI_FLASH_LITE = process.env.GEMINI_FLASH_LITE_MODEL || 'gemini-2.5-flash-lite';

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
  // === Core Models (existing) ===
  diagnosis: {
    model: process.env.LLM_MODEL_DIAGNOSIS || GEMINI_FLASH,
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_DIAGNOSIS || '0'),
  },
  proposal: {
    model: process.env.LLM_MODEL_PROPOSAL || GEMINI_FLASH,
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_PROPOSAL || '0'),
  },
  flash: {
    model: process.env.LLM_MODEL_FLASH || GEMINI_FLASH,
    thinkingBudget: 0, // Flash never uses thinking
  },

  // === Email Models ===
  email: {
    model: process.env.LLM_MODEL_EMAIL || GEMINI_FLASH,
    temperature: 0.7,
    maxOutputTokens: 512,
  },
  emailFollowUp: {
    model: process.env.LLM_MODEL_EMAIL_FOLLOWUP || GEMINI_FLASH,
    temperature: 0.8,
    maxOutputTokens: 512,
  },

  // === Chat/Sales Models ===
  chat: {
    model: process.env.LLM_MODEL_CHAT || GEMINI_FLASH,
    temperature: 0.7,
    maxOutputTokens: 1024,
  },
  salesChat: {
    model: process.env.LLM_MODEL_SALES_CHAT || GEMINI_FLASH,
    temperature: 0.6,
    maxOutputTokens: 1024,
  },

  // === Multimodal Models ===
  multimodal: {
    model: process.env.LLM_MODEL_MULTIMODAL || GEMINI_PRO,
    thinkingBudget: 0,
  },

  // === Localization Models ===
  localization: {
    model: process.env.LLM_MODEL_LOCALIZATION || GEMINI_FLASH,
    temperature: 0.3,
  },
  translation: {
    model: process.env.LLM_MODEL_TRANSLATION || GEMINI_FLASH,
    temperature: 0.3,
  },

  // === Analysis Models ===
  clustering: {
    model: process.env.LLM_MODEL_CLUSTERING || GEMINI_FLASH,
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_CLUSTERING || '0'),
  },
  analysis: {
    model: process.env.LLM_MODEL_ANALYSIS || GEMINI_PRO,
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_ANALYSIS || '0'),
  },

  // === Executive Summary ===
  executiveSummary: {
    model: process.env.LLM_MODEL_EXEC_SUMMARY || GEMINI_PRO,
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_EXEC_SUMMARY || '0'),
    temperature: 0.3,
  },

  // === Pricing Generation ===
  pricing: {
    model: process.env.LLM_MODEL_PRICING || GEMINI_FLASH,
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
  return modelName.includes('flash') || modelName.includes('haiku');
}

/**
 * Check if a model is a "pro" class (powerful, expensive) model
 */
export function isProModel(modelName: string): boolean {
  return modelName.includes('pro') || modelName.includes('opus') || modelName.includes('gpt-4');
}
