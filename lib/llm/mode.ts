/**
 * lib/llm/mode.ts
 *
 * Single source of truth for "is an LLM backend active, and which one".
 *
 * Production path is Amazon Bedrock only. For the controlled joined journey
 * (and future CI fixture qualification) a strictly test-scoped deterministic
 * fixture provider exists: PROPOSALOS_FIXTURE_LLM_ENABLED=true selects it via
 * LLM_PRIMARY_PROVIDER=fixture. The fixture mode hard-refuses in production so
 * it can never silently serve deterministic outputs to real customers.
 */

export function isFixtureLlmEnabled(): boolean {
  return (
    process.env.PROPOSALOS_FIXTURE_LLM_ENABLED === 'true' && process.env.NODE_ENV !== 'production'
  );
}

export function isFixtureLlmSelected(): boolean {
  return isFixtureLlmEnabled() && process.env.LLM_PRIMARY_PROVIDER === 'fixture';
}

/** True when either the real Bedrock backend or the test fixture backend is active. */
export function isActiveLlmEnabled(): boolean {
  return process.env.BEDROCK_ENABLED === 'true' || isFixtureLlmEnabled();
}
