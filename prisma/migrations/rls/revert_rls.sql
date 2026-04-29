-- ============================================================================
-- Revert Migration: Disable Row Level Security on all tenant-scoped tables
-- To apply: psql $DATABASE_URL -f prisma/migrations/rls/revert_rls.sql
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'Audit', 'Finding', 'Proposal', 'ContactRequest', 'ProposalFollowUp',
    'EvidenceSnapshot', 'ProposalTemplate', 'User', 'Invitation', 'Playbook',
    'AuditSchedule', 'AuditTarget', 'ProspectDiscoveryJob', 'ProspectLead',
    'ProspectEnrichmentRun', 'OutreachSendingDomain', 'OutreachDomainDailyStat',
    'OutreachEmail', 'OutreachEmailEvent', 'ApiKey', 'TenantBranding',
    'ProspectStateTransition', 'DeliveryTask', 'PipelineConfig', 'PipelineErrorLog',
    'WinLossRecord', 'PreWarmingAction', 'DetectedSignal', 'ChatConversation',
    'Project', 'NPSSurvey', 'QATelemetry', 'UsageRecord',
    'ProposalOutreach', 'FollowUpEmailSend'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END
$$;

-- Optionally drop the role (only if no other database objects depend on it)
-- DROP ROLE IF EXISTS app_user;
