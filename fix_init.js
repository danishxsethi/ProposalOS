const fs = require('fs');
let sql = fs.readFileSync('temp_migration.sql', 'utf8');

// 1. Tables where tenantId must be nullable
const makeNullable = ['Finding', 'Proposal', 'EvidenceSnapshot', 'ProposalTemplate', 'User', 'checkout_attempts', 'QATelemetry'];
makeNullable.forEach(t => {
  const tableRegex = new RegExp('CREATE TABLE "' + t + '" \\([\\s\\S]*?\\);', 'g');
  sql = sql.replace(tableRegex, match => match.replace(/"tenantId" TEXT NOT NULL/g, '"tenantId" TEXT'));
});

// 2. Tables where tenantId must be removed
const removeTenant = ['ProposalAcceptance', 'ProposalView', 'AuditTarget', 'OutreachTemplatePerformance', 'ProposalOutreach', 'FollowUpEmailSend', 'FailedWebhookEvent', 'CartAbandonmentEvent', 'PartnerDeliveredLead'];
removeTenant.forEach(t => {
  const tableRegex = new RegExp('CREATE TABLE "' + t + '" \\([\\s\\S]*?\\);', 'g');
  sql = sql.replace(tableRegex, match => {
    let newMatch = match.replace(/\s*"tenantId" TEXT NOT NULL,?/g, '');
    newMatch = newMatch.replace(/\s*"tenantId" TEXT,?/g, '');
    return newMatch;
  });
  
  // Remove indexes for this table's tenantId
  sql = sql.replace(new RegExp('CREATE INDEX "' + t + '_tenantId_idx" ON "' + t + '"\\("tenantId"\\);\\n', 'g'), '');
  // Remove unique constraints containing tenantId
  sql = sql.replace(new RegExp('CREATE UNIQUE INDEX "' + t + '_tenantId_.*?;\\n', 'g'), '');
});

// 3. Remove foreign keys for removed tenantIds
removeTenant.forEach(t => {
  sql = sql.replace(new RegExp('ALTER TABLE "' + t + '" ADD CONSTRAINT "' + t + '_tenantId_fkey" FOREIGN KEY \\("tenantId"\\) REFERENCES "Tenant"\\("id"\\) ON DELETE CASCADE ON UPDATE CASCADE;\\n', 'g'), '');
});

// Remove tables added in 20260315_add_circuit_breaker_dlq_models
sql = sql.replace(/-- CreateTable\nCREATE TABLE "CircuitBreakerState" \([\s\S]*?\);\n/g, '');
sql = sql.replace(/-- CreateTable\nCREATE TABLE "DeadLetterQueue" \([\s\S]*?\);\n/g, '');

fs.writeFileSync('prisma/migrations/20260227000000_init/migration.sql', sql);
