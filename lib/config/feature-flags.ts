export const FEATURE_FLAGS = {
    // Model routing
    GEMINI_31_PRO_ENABLED: process.env.GEMINI_31_PRO_ENABLED === 'true',
    GEMINI_31_PRO_TRAFFIC_PCT: parseInt(process.env.GEMINI_31_PRO_TRAFFIC_PCT || '0'),

    // Per-feature toggles
    THINKING_MODE_ENABLED: process.env.THINKING_MODE_ENABLED === 'true',
    MULTIMODAL_ENABLED: process.env.MULTIMODAL_ENABLED === 'true',
    STREAMING_ENABLED: process.env.STREAMING_ENABLED === 'true',
    SINGLE_PASS_DIAGNOSIS: process.env.SINGLE_PASS_DIAGNOSIS === 'false' ? false : true,
} as const;
