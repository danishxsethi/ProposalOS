# Observability

Source includes structured logger, metrics, audit trail, request/tenant/workflow context, OpenTelemetry packages, LangSmith tracing, QA/hallucination telemetry, and health/metrics routes.

Observed local evidence:

- Build/test logs state LangSmith tracing disabled because `LANGCHAIN_API_KEY` or `LANGCHAIN_PROJECT` is missing.
- Build logs state Redis cache disabled because no Redis is configured and local cache is not allowed.
- No production trace proves request -> audit -> worker -> module -> model -> proposal -> delivery correlation.
- No dashboards, alerts, retention, sampling, PII redaction, or operator incident drill was observed live.

**State:** `IMPLEMENTED_NOT_INTEGRATED`.

GA closure requires a redacted real trace with request/audit/tenant/workflow/module/provider/model/prompt/cost/latency/error identifiers, alert tests, and no secret/customer payload leakage.
