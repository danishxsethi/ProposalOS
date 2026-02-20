export const MODEL_CONFIG = {
  diagnosis: {
    model: process.env.LLM_MODEL_DIAGNOSIS || 'gemini-2.5-flash',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_DIAGNOSIS || '0'),
  },
  proposal: {
    model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.5-flash',
    thinkingBudget: parseInt(process.env.THINKING_BUDGET_PROPOSAL || '0'),
  },
  flash: {
    model: process.env.LLM_MODEL_FLASH || 'gemini-2.5-flash',
    thinkingBudget: 0,  // Flash never uses thinking
  },
} as const;
