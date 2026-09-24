# Audit Engine Assessment

## Inventory

The executable registry contains 27 modules across three phases: website, crawler, GBP, competitor, tech stack, security, email finder, Core Web Vitals, schema, reputation, social, social deep, GBP deep, SEO deep, accessibility, mobile UX, content quality, conversion, citations, paid search, backlinks, privacy compliance, schema markup, keyword gap, video presence, competitor strategy, and vision. Details are in `module-inventory.csv`.

## Strengths

- Shared manifest and registry are architecture-tested for count, IDs, phases, dependencies, optionality, and timeouts.
- Phase concurrency is bounded.
- Findings pass a shared contract and persistence boundary.
- Several newer modules preserve `unavailable`, `partial`, `ambiguous`, or `not_observed` states.

## Material defects

- URL-only Redis cache returns a successful cached result before target audit materialization, and is not tenant/config scoped (`lib/audit/runner.ts:1515-1532`).
- Production callers directly invoke `runAudit()` in delivery, pipeline, and automated outreach, bypassing queue durability.
- Multiple adapters map nested errors/empty outputs to `COMPLETE`.
- `PARTIAL` results reach extraction but extraction returns no findings unless status is exactly `COMPLETE`.
- Runtime finding confidence/type contract does not match Prisma integer/enum schema; Core Web Vitals emits `8.5`.
- Evidence snapshot persistence is non-fatal and outside the finding transaction.
- Citations and PageSpeed paths can turn unavailable provider data into negative customer findings.
- Global timeout default, comments, and error message disagree.

## Truth status

`WORKING_WITH_LIMITATIONS`, not `VERIFIED_WORKING`. Closure requires a real database/provider integration test, cache materialization regression test, complete module failure matrix, and exact runtime trace.
