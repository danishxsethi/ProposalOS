-- ============================================================================
-- Migration: Auth-Table RLS (Task #14)
--
-- Resolves the deferred auth-table RLS gap from PHASE-2.6-K-LOCAL-RLS-VERIFICATION.md.
--
-- Strategy: Pattern A (global identity tables) + Pattern C (narrow guarded
-- bypass).  Account / Session / VerificationToken are global identity
-- tables — they have no tenantId column and cannot get one without breaking
-- NextAuth/Auth.js semantics (one Account or VerificationToken can be
-- valid for any tenant the user belongs to in future multi-tenant designs).
--
-- The safe model is therefore:
--   - Enable RLS + FORCE RLS on these tables.
--   - Do NOT add a tenant_isolation policy (no tenantId to filter on).
--   - Add ONLY a tenant_bypass policy that requires
--     `app.bypass_rls = 'true'` to be set.
--   - Auth-adapter callsites set this flag via runWithAuthAdapterContext,
--     which is gated by an allow-list in lib/auth/adapterContext.ts.
--
-- Effect:
--   - Plain `prisma.account.*` calls without auth bypass → 0 rows / blocked.
--   - Adapter calls under `runWithAuthAdapterContext` → succeed.
--   - Business code attempting to use these tables to escalate access
--     fails at the lib/auth/adapterContext.ts allow-list (cannot reach
--     the SQL layer).
--
-- The User table already has a tenant_isolation + tenant_bypass policy
-- from 20260429093000_enable_rls.  We do NOT change that here.
--
-- Forward-only.  Empty-DB replay safe.
-- ============================================================================

-- ─── Account ──────────────────────────────────────────────────────────────────
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_bypass ON "Account";
CREATE POLICY tenant_bypass ON "Account"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- ─── Session ──────────────────────────────────────────────────────────────────
-- Session table is unused under the JWT strategy (lib/auth.ts uses
-- session: { strategy: 'jwt' }) but is kept in the schema for compatibility
-- with the Auth.js PrismaAdapter type expectations.  RLS on this table
-- makes accidental SELECT/INSERT/UPDATE/DELETE return 0 rows / fail
-- without auth-adapter bypass.
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_bypass ON "Session";
CREATE POLICY tenant_bypass ON "Session"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- ─── VerificationToken ────────────────────────────────────────────────────────
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_bypass ON "VerificationToken";
CREATE POLICY tenant_bypass ON "VerificationToken"
  FOR ALL
  USING (current_setting('app.bypass_rls', true) = 'true')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'true');

-- Documentation note: User table already has tenant_isolation + tenant_bypass
-- from 20260429093000_enable_rls.  Credentials login lookup runs under
-- auth-adapter bypass (see lib/auth.ts).
