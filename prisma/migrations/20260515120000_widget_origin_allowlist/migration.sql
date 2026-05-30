-- ============================================================================
-- Migration: Add allowedWidgetOrigins to TenantBranding
-- Task #13: Widget origin allow-list
--
-- Adds an exact-match origin allow-list per tenant to gate
-- POST /api/widget/quick-audit and its OPTIONS preflight.  Empty array
-- (default) means widget is disabled for that tenant.  No wildcards.
--
-- Forward-only.  Default empty array preserves existing behaviour for any
-- tenant that has not yet configured origins (widget calls will be denied
-- safely until the tenant adds origins).
-- ============================================================================

ALTER TABLE "TenantBranding"
  ADD COLUMN "allowedWidgetOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
