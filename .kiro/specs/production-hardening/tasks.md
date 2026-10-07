# Implementation Plan: Production Hardening

## Overview

This plan hardens ProposalOS from a post-audit state with known defects into a production-grade platform. Work is organized into six phases.

## Tasks

- [x] 1. Phase 1 — Security & Data Integrity
  - [x] 1.1 Verify auth middleware dual-path tenant resolution
  - [x] 1.2 Audit all API routes for tenant isolation via createScopedPrisma
  - [x] 1.3 Write property test for tenant scoping injection (Property 10)
  - [x] 1.4 Fix widget route compilation and correctness
  - [x] 1.5 Harden cache clear endpoint protection

- [x] 2. Checkpoint — Phase 1 complete

- [x] 3. Phase 2 — Module Reliability & Data Shape Unification
  - [x] 3.1 Verify module adapter normalization in audit runner
  - [x] 3.2 Verify MODULE_REGISTRY is single source of truth
  - [x] 3.3 Unify evidence format and createEvidence usage
  - [x] 3.4 Write property test for evidence round-trip (Property 1)
  - [x] 3.5 Write property test for evidence validation consistency (Property 2)
  - [x] 3.6 Verify reputation module environment variable correctness
  - [x] 3.7 Verify and fix deduplicateFindings
  - [x] 3.8 Write property test for deduplication idempotence (Property 3)
  - [x] 3.9 Write property test for deduplication correctness (Property 4)
  - [x] 3.10 Verify frozen data contracts

- [x] 4. Checkpoint — Phase 2 complete

- [x] 5. Phase 3 — Proposal Compiler, QA Gate, Claim Policy
  - [x] 5.1 Verify AutoQA check completeness and evidence validation
  - [x] 5.2 Write property test for hard-fail forces score to zero (Property 12)
  - [x] 5.3 Wire proposal auto-READY gate
  - [x] 5.4 Write property test for proposal auto-READY threshold (Property 9)
  - [x] 5.5 Verify deterministic tier mapping and pricing
  - [x] 5.6 Write property test for pricing invariant (Property 5)
  - [x] 5.7 Write property test for tier mapping — no phantom IDs (Property 6)
  - [x] 5.8 Write property test for tier mapping — minimum tier size (Property 7)
  - [x] 5.9 Enforce claim policy in proposal compiler
  - [x] 5.10 Write property test for finding normalization ensures evidence (Property 8)

- [x] 6. Checkpoint — Phase 3 complete

- [x] 7. Phase 4 — Observability, Env Hardening, Startup Safety
  - [x] 7.1 Wire validateEnv into application startup
  - [x] 7.2 Write property test for validateEnv reports all missing vars (Property 11)
  - [x] 7.3 Verify and harden health endpoints
  - [x] 7.4 Replace console.\* with structured logger in production code — COMPLETED 2026-06-18 (#10). app/api/ → 0 console.\* (58 files replaced). Client-side .tsx kept: browser has no pino. lib/config/validateEnv.ts startup banner kept (runs before logger init, intentional). lib/integrations/retryWrapper.ts JSDoc kept (comment-only). See lib/security/piiScrubber.ts — Stripe key patterns added.

- [x] 8. Checkpoint — Phase 4 complete

- [x] 9. Phase 5 — Build Quality & Testing
  - [x] 9.1 Fix TypeScript compilation to zero errors
  - [x] 9.2 Set ignoreBuildErrors to false in next.config.mjs
  - [x] 9.3 Verify test suite passes and coverage meets threshold

- [x] 10. Checkpoint — Phase 5 complete

- [x] 11. Phase 6 — E2E & Deployment
  - [x] 11.1 Create E2E smoke tests with Playwright
  - [x] 11.2 Verify Docker build and deployment configuration
  - [x] 11.3 Run performance benchmarks

- [x] 12. Final checkpoint — All phases complete

## Notes

- Each task references specific requirements and design components for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate the 12 correctness properties using fast-check
- The design specifies "fix in place" — modify existing files rather than introducing new abstractions
