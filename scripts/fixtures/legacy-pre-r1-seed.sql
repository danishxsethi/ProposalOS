-- legacy-pre-r1-seed.sql
--
-- Deterministic legacy-data fixture for migration verification.
-- Written against the PRE-R1 schema checkpoint (all migrations up to and
-- including 20260713090000_wave9d_lifecycle_controls; before the two
-- 20260924* R1 migrations). Deterministic: fixed UUIDs, fixed timestamps,
-- no now()/random().
--
-- Coverage:
--   - 2 tenants, audits in representative AuditStatus states
--   - audit_jobs in representative queue states (QUEUED / SUCCEEDED / DEAD)
--   - findings covering every pre-R1 FindingType, confidence values 0-10,
--     >10 (legacy percentage convention), boundary 100, and nullable fields
--     (confidenceLevel / description / effortEstimate NULL)
--   - evidence snapshots with NULL targetUrl-able legacy shape

BEGIN;

INSERT INTO "Tenant" ("id", "name", "slug", "planTier", "status", "isActive", "createdAt", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Legacy Tenant Alpha', 'legacy-alpha', 'pro', 'active', true,  '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000000b2', 'Legacy Tenant Beta',  'legacy-beta',  'free', 'trial',  true,  '2026-06-02T00:00:00Z', '2026-06-02T00:00:00Z');

INSERT INTO "Audit" ("id", "businessName", "businessCity", "businessUrl", "status", "overallScore", "tenantId", "startedAt", "createdAt", "completedAt") VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'Alpha Dental', 'Austin',  'https://alpha-dental.example', 'COMPLETE', 72,   '00000000-0000-4000-8000-0000000000a1', '2026-07-01T10:00:00Z', '2026-07-01T10:00:00Z', '2026-07-01T10:05:00Z'),
  ('00000000-0000-4000-8000-0000000000c2', 'Beta Law',     'Denver',  NULL,                            'FAILED',   NULL, '00000000-0000-4000-8000-0000000000b2', '2026-07-02T11:00:00Z', '2026-07-02T11:00:00Z', NULL),
  ('00000000-0000-4000-8000-0000000000c3', 'Alpha Cafe',   'Austin',  'https://alpha-cafe.example',   'QUEUED',   NULL, '00000000-0000-4000-8000-0000000000a1', '2026-07-03T12:00:00Z', '2026-07-03T12:00:00Z', NULL);

-- Findings: every pre-R1 FindingType + confidence edge cases.
-- confidenceScore semantics pre-R1: <=10 already product scale, >10 legacy percent.
INSERT INTO "Finding" ("id", "auditId", "tenantId", "module", "category", "type", "title", "description", "impactScore", "confidenceScore", "effortEstimate", "confidenceLevel", "createdAt") VALUES
  -- in-scale low boundary 0
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'website',  'performance', 'PAINKILLER',        'Slow LCP',            'LCP 6.2s',                 8, 0,   'LOW',    'LOW',    '2026-07-01T10:01:00Z'),
  -- in-scale mid 7, nullable description
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'security', 'headers',     'VITAMIN',           'Missing CSP',         NULL,                       4, 7,   'MEDIUM', 'MEDIUM', '2026-07-01T10:02:00Z'),
  -- legacy percent 42 -> expect round(4.2) = 4
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'content',  'quality',     'VISUAL_UX',         'Thin content',        'Word count 180',           6, 42,  'HIGH',   'HIGH',   '2026-07-01T10:03:00Z'),
  -- boundary 100 -> expect 10; fully nullable record (description, effortEstimate, confidenceLevel all NULL)
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b2', 'website',  'availability','VISUAL_DESIGN',     'Site unreachable',    NULL,                       10, 100, NULL,     NULL,     '2026-07-02T11:01:00Z'),
  -- cross-check type coverage
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b2', 'visual',   'comparison',  'VISUAL_COMPARISON', 'Below competitor bar', 'Heuristic comparison',     5, 55,  'MEDIUM', NULL,     '2026-07-02T11:02:00Z'),
  -- percent 95 -> expect round(9.5) = 10 (Postgres numeric round is half-away-from-zero)
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b2', 'keywords', 'gap',         'PAINKILLER',        'No local keywords',   'Zero local terms ranked',  7, 95,  'HIGH',   'HIGH',   '2026-07-02T11:03:00Z');

-- FindingStatus rows (tenantId explicitly set to match the parent finding's
-- tenant, as the 20260504184154 backfill would have produced).
-- tenantId is NOT NULL at this checkpoint (backfilled by 20260504184154);
-- values here exercise tenant preservation across the R1 chain.
INSERT INTO "FindingStatus" ("id", "auditId", "findingId", "tenantId", "status", "notes", "updatedBy", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'fixed',       'Deployed cache layer', 'legacy-operator', '2026-07-05T09:00:00Z'),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000b2', 'in_progress', NULL,                   NULL,              '2026-07-06T09:00:00Z');

-- Audit trail event with nullable tenantId/actorId.
INSERT INTO "AuditTrailEvent" ("id", "eventType", "occurredAt", "tenantId", "auditId", "findingsCount", "payload", "eventHash") VALUES
  ('00000000-0000-4000-8000-000000000061', 'audit.completed', '2026-07-01T10:05:01Z', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 3, '{"legacy": true}', 'legacy-hash-0001');

INSERT INTO "EvidenceSnapshot" ("id", "auditId", "tenantId", "module", "source", "rawResponse", "collectedAt") VALUES
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'website',  'pagespeed', '{"lcp": 6.2}',        '2026-07-01T10:00:30Z'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'security', 'headerScan','{"csp": null}',       '2026-07-01T10:00:45Z'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b2', 'website',  'httpProbe', '{"status": 503}',     '2026-07-02T11:00:30Z');

INSERT INTO "audit_jobs" ("id", "tenantId", "batchId", "auditId", "idempotencyKey", "status", "attempts", "maxAttempts", "createdAt", "updatedAt") VALUES
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'legacy-batch-1', '00000000-0000-4000-8000-0000000000c1', 'legacy-key-1', 'SUCCEEDED', 1, 3, '2026-07-01T09:59:00Z', '2026-07-01T10:05:00Z'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b2', 'legacy-batch-1', '00000000-0000-4000-8000-0000000000c2', 'legacy-key-2', 'DEAD',      3, 3, '2026-07-02T10:59:00Z', '2026-07-02T11:10:00Z'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', 'legacy-batch-2', '00000000-0000-4000-8000-0000000000c3', 'legacy-key-3', 'QUEUED',    0, 3, '2026-07-03T11:59:00Z', '2026-07-03T11:59:00Z');

COMMIT;
