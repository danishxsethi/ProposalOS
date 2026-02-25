-- Create a policy for tenant isolation
-- Applies to Audit, Finding, Proposal, ProspectLead, ProspectDiscoveryJob, etc.

-- Enable RLS on Tenant Scoped Tables
ALTER TABLE "Audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectDiscoveryJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantBranding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditSchedule" ENABLE ROW LEVEL SECURITY;

-- Create Policies to ensure tenant isolation relies on current_setting('app.tenant_id')
-- If app.tenant_id is not set, it shouldn't expose rows (except for super admins if needed, but not handled here)

-- Audit
DROP POLICY IF EXISTS "tenant_isolation_audit" ON "Audit";
CREATE POLICY "tenant_isolation_audit" ON "Audit"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- Finding
DROP POLICY IF EXISTS "tenant_isolation_finding" ON "Finding";
CREATE POLICY "tenant_isolation_finding" ON "Finding"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- Proposal
DROP POLICY IF EXISTS "tenant_isolation_proposal" ON "Proposal";
CREATE POLICY "tenant_isolation_proposal" ON "Proposal"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- ProspectLead
DROP POLICY IF EXISTS "tenant_isolation_prospect_lead" ON "ProspectLead";
CREATE POLICY "tenant_isolation_prospect_lead" ON "ProspectLead"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- ProspectDiscoveryJob
DROP POLICY IF EXISTS "tenant_isolation_prospect_job" ON "ProspectDiscoveryJob";
CREATE POLICY "tenant_isolation_prospect_job" ON "ProspectDiscoveryJob"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- TenantBranding
DROP POLICY IF EXISTS "tenant_isolation_branding" ON "TenantBranding";
CREATE POLICY "tenant_isolation_branding" ON "TenantBranding"
    USING ("tenantId" = current_setting('app.tenant_id', true));

-- AuditSchedule
DROP POLICY IF EXISTS "tenant_isolation_audit_schedule" ON "AuditSchedule";
CREATE POLICY "tenant_isolation_audit_schedule" ON "AuditSchedule"
    USING ("tenantId" = current_setting('app.tenant_id', true));
