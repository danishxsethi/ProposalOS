import { checkRateLimit, resetRateLimits } from './lib/auth/rateLimit';

console.log("Testing Token Bucket Rate Limiter...");

// 1. Test Free Tier bursts (max 10, no real burst)
resetRateLimits();
let allowedCount = 0;
for (let i = 0; i < 15; i++) {
    const result = checkRateLimit('test-tenant', 'free');
    if (result.allowed) allowedCount++;
}
console.log(`Free Tier Allowed: ${allowedCount}/15 (Expected: 10)`);

// 2. Test Gemini 3.1 Pro (max 50)
resetRateLimits();
allowedCount = 0;
for (let i = 0; i < 60; i++) {
    const result = checkRateLimit('test-tenant', 'gemini-3.1-pro');
    if (result.allowed) allowedCount++;
}
console.log(`Gemini Pro Allowed: ${allowedCount}/60 (Expected: 50)`);

// 3. Test token cost multipliers
resetRateLimits();
allowedCount = 0;
for (let i = 0; i < 10; i++) {
    // Each request costs 10 tokens against a limit of 50
    const result = checkRateLimit('test-tenant', 'gemini-3.1-pro', 10);
    if (result.allowed) allowedCount++;
}
console.log(`Gemini Pro High Cost Allowed: ${allowedCount}/10 (Expected: 5)`);
