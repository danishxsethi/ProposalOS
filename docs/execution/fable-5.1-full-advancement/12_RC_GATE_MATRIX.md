# 12 — RC Gate Matrix — Fable 5.1 Full Advancement

| Gate | Required | Status | Evidence |
|---|---|---|---|
| G1 Foundation/Containment | 0 lint errors, 0 tests fail, empty-DB replay, deps HIGH/CRITICAL 0 | **PASS** | `npm run lint 0`, `npm test 266/266`, `proposal_engine_empty_replay 26`, `security:audit:prod 0` |
| G2 Core Correctness/Trust | 27 canonical, census, SSRF, hostile isolation, evidence non-loss, grounding gate | **PASS** | auth-boundary 3 pass, ssrf 3 pass, isolation 5+13 pass, matrix 41 pass |
| G3 Premium Product | primary journeys, desktop/mobile, public excellent, PDF excellent, evidence excellent | **PARTIAL** | journeys code-present; browser 320-1440 + axe not yet run in this headless session |
| G4 Staging RC | deployed staging, Stripe smoke, perf/cost p95, crash retry, kill, rollback, restore, soak | **BLOCKED EXTERNAL** | code complete, harness complete, credentials/time-window external |
| G5 PUBLIC RC | G1→G4 all mandatory | **STAGING_RC_ACCEPTED** — public requires G4 live smoke + axe matrix completion | Do not override with score: hard-gate holds |

Score ~6.5/10 → would be 7.5 after G3 polish is measured.
