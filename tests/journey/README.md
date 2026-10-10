# Controlled joined-journey harness (M1)

This directory contains the harness that executes ONE coherent audit-to-proposal
journey through the real product with controlled fixtures. It exists to prove
`CONTROLLED_JOINED_JOURNEY_VERIFIED`: real intake API + durable queue + real
worker + real collectors + real diagnosis/proposal graphs + proposal QA +
authenticated review + secure view + PDF — all against disposable, local
infrastructure.

## What is real, what is fixture, and how the boundaries stay narrow

| Boundary                                                          | Mechanism                                                                                                                                                                                                                        | Guard                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit target website                                              | Real HTTP server on 127.0.0.1 (`fixture-site.mjs`) crawled by the real SSRF-validated collectors                                                                                                                                 | `PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS` — exact-host loopback allowlist in `lib/security/urlValidator.ts`; hard-refused when `NODE_ENV=production`; non-loopback resolutions fail closed. See `tests/security/ssrf-fixture-allowlist.test.ts`. |
| External data providers (SerpApi, Yelp, BBB, YellowPages, Google) | Local fixture server (`fixture-providers.mjs`); a preload script (`fixture-fetch-preload.cjs`, injected via `NODE_OPTIONS=--require` so it applies in every Next dev process) rewrites ONLY the allowlisted provider hosts to it | `PROPOSALOS_PROVIDER_FIXTURE_URL` + `PROPOSALOS_PROVIDER_FIXTURE_HOSTS`; refused in production; every other destination untouched.                                                                                                          |
| Object storage (S3)                                               | Local S3-compatible server (`fixture-s3.mjs`); the application's real AWS SDK client talks to it via the standard `AWS_ENDPOINT_URL` env                                                                                         | No application code change; loopback only; real Put/Get/presigned behavior.                                                                                                                                                                 |
| LLM (Bedrock)                                                     | Deterministic fixture provider (`lib/llm/providers/fixture.ts`)                                                                                                                                                                  | `PROPOSALOS_FIXTURE_LLM_ENABLED=true` + `LLM_PRIMARY_PROVIDER=fixture`; refused in production; every response labeled `provider: 'fixture'`; unknown nodes throw (fail-closed). **A run with this provider is never real inference.**       |
| Email / outreach / billing / scheduled jobs                       | Email: `RESEND_API_KEY` deliberately unset (sendEmail no-ops). Outreach flags off. No stripe/billing flows exercised.                                                                                                            | —                                                                                                                                                                                                                                           |

The database is a disposable, migrated PostgreSQL database and the Next server
connects through the RLS-enforced `app_user` role, exactly like the production
connection path. The run is torn down (server killed, database dropped) at the
end.

## Running

```bash
# Prerequisites: local Postgres reachable by JOURNEY_DB_ADMIN_URL (or the
# default disposable container), Chrome at /usr/bin/chrome, node modules installed.
node tests/journey/run-journey.mjs
```

Artifacts land in `tests/journey/evidence/` (gitignored):
`journey-evidence-<run>.json` (full structured evidence record),
`proposal-<run>.pdf`, `proposal-page-<run>.html`, and the Next server log.

## Honesty rules

- A journey run with the fixture LLM provider is a **fixture journey**, not real
  inference; the evidence record labels it as such.
- Provider data (maps listings, reviews, SERP results) is fixture data about a
  fixture business; findings are the product's real analysis of that fixture.
- The fixture site's deliberate issues and positive controls are documented in
  `fixture-site.mjs` and must stay in sync with the assertions in the evidence
  record.
