/**
 * Centralized LLM Model Configuration
 *
 * All model selections should be configured here, not hardcoded in individual files.
 * This enables easy model switching, A/B testing, and cost optimization.
 */

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
    model: process.env.LLM_MODEL_DIAGNOSIS || 'gemini-2.0-flash',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_DIAGNOSIS || '0'),
  },
  proposal: {
    model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.0-flash',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_PROPOSAL || '0'),
  },
  flash: {
    model: process.env.LLM_MODEL_FLASH || 'gemini-2.0-flash',
    thinkingBudget: 0, // Flash never uses thinking
  },

  // === Email Models ===
  email: {
    model: process.env.LLM_MODEL_EMAIL || 'gemini-2.0-flash',
    temperature: 0.7,
    maxOutputTokens: 512,
  },
  emailFollowUp: {
    model: process.env.LLM_MODEL_EMAIL_FOLLOWUP || 'gemini-2.0-flash',
    temperature: 0.8,
    maxOutputTokens: 512,
  },

  // === Chat/Sales Models ===
  chat: {
    model: process.env.LLM_MODEL_CHAT || 'gemini-2.0-flash',
    temperature: 0.7,
    maxOutputTokens: 1024,
  },
  salesChat: {
    model: process.env.LLM_MODEL_SALES_CHAT || 'gemini-2.0-flash',
    temperature: 0.6,
    maxOutputTokens: 1024,
  },

  // === Multimodal Models ===
  multimodal: {
    model: process.env.LLM_MODEL_MULTIMODAL || 'gemini-2.0-pro',
    thinkingBudget: 0,
  },

  // === Localization Models ===
  localization: {
    model: process.env.LLM_MODEL_LOCALIZATION || 'gemini-2.0-flash',
    temperature: 0.3,
  },
  translation: {
    model: process.env.LLM_MODEL_TRANSLATION || 'gemini-2.0-flash',
    temperature: 0.3,
  },

  // === Analysis Models ===
  clustering: {
    model: process.env.LLM_MODEL_CLUSTERING || 'gemini-2.0-flash',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_CLUSTERING || '0'),
  },
  analysis: {
    model: process.env.LLM_MODEL_ANALYSIS || 'gemini-2.0-pro',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_ANALYSIS || '0'),
  },

  // === Executive Summary ===
  executiveSummary: {
    model: process.env.LLM_MODEL_EXEC_SUMMARY || 'gemini-2.0-pro',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_EXEC_SUMMARY || '0'),
    temperature: 0.3,
  },

  // === Pricing Generation ===
  pricing: {
    model: process.env.LLM_MODEL_PRICING || 'gemini-2.0-flash',
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
