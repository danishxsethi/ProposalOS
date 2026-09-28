# 09 — Test & Evidence Matrix — Fable 5.1

## Pyramid

| Layer | Count | Runs in CI | Blocking | Deterministic |
|---|---|---|---|---|
| Unit | ~180 suites | yes (test.yml) | yes | mostly |
| Integration (Prisma + RLS) | ~40 | yes (postgres+pgbouncer bootstrap) | yes | needs clean migration state |
| Contract (finding, grounding) | ~15 | yes | yes | yes |
| Architecture (boundary) | ~20 | yes | yes (currently failing 3) | yes |
| E2E browser | ~5 | optional (Playwright not wired as blocking) | no | UNVERIFIED |

## Coverage

- `threshold lines 80%` configured; sample single-file run 0.73% (not representative). Full coverage not captured on this dirty HEAD; needs `npm run test:coverage` on clean branch.
- 80 skipped tests (quarantined/environment-dependent) — must justify before RC if in primary journey.
- 182 failures on first attempt (no DB without bootstrap), 15 then 11 on dirty branch after push — signal is boundary tests, not infra.

## Untested (per this audit)

- Keyboard-only + screen reader + 200% zoom on primary journeys — no a11y automation run.
- Visual regression baseline for primary surfaces — not present.
- Load/soak/chaos — not run.
- AI golden-set proposal eval (5 industries) — not run.
- Billing money smoke (Stripe test-mode) — not run.

RC requires: migration replay empty DB passes without data loss, all blocking tests pass no unexplained skip, primary journeys E2E, visual baseline, a11y no critical/serious.

