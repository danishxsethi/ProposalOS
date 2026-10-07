# 13 — External Blockers Only — Fable 5.1 Full Advancement

| Blocker | Why external | Code side complete? | Harness complete? | Remaining action |
|---|---|---|---|---|
| Stripe sk_test live smoke (proposal/saas checkout + webhook dedup) | needs test API key with webhook secret | yes (new idempotencyKey + fingerprint binding) | yes (stripe-checkout-authz 4 pass mock) | set STRIPE_SECRET_KEY=sk_test... + RESEND secret |
| Browser UX screenshots 320/375/768/1024/1440 + axe | needs Playwright/Chromium real server + time | design spec done (07) | not yet — requires `npx playwright install` + `next build && next start` | run `npm run lint` + axe on 5 pages |
| 10 audits×5 industries p95 + soak | needs Maps/PSI/SerpAPI LLM keys + 24h window | costTracker + phases correct | scripts/e2e-full-audit.js exists | provide GOOGLE_* keys |
