# Diagnosis / AI Assessment

LangGraph diagnosis is genuinely present in source. It validates audit and tenant identity, verifies evidence, clusters findings, ranks by deterministic severity/effort, generates narratives, retries validation, and runs adversarial QA. Proposal generation similarly uses structured output and deterministic pricing/tier mapping around LLM content.

Limitations:

- Evidence verification failures can pass findings through unchanged.
- Graph timeouts and adversarial QA failures can return degraded state instead of a failed/non-publishable result.
- The diagnosis HTTP route returns 200 regardless of degraded/errors/validation state.
- Prompt-injection tests exist and pass locally, but no live hostile website trace was run.
- Model, prompt version, token, latency, and cost telemetry are not proven in a live trace; local build/test logs show LangSmith disabled without credentials.
- No production Temporal graph or worker exists; graph presence is not runtime proof.

**State:** `WORKING_WITH_LIMITATIONS`.

**Acceptance criteria:** explicit `TRUSTED`, `DEGRADED_REVIEW_REQUIRED`, and `FAILED` states; degraded diagnosis cannot create a publishable proposal; every customer-visible claim binds to validated finding/evidence; adversarial data is untrusted and cannot access tools/secrets; live trace contains request/audit/tenant/graph/node/model/prompt/cost/error identifiers.
