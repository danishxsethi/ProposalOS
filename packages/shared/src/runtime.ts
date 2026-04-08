export function isMockFallbackEnabled(): boolean {
  return process.env.ENABLE_MOCK_FALLBACKS === 'true';
}
