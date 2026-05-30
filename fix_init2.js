const fs = require('fs');

const makeNullable = ['"Finding"', '"Proposal"', '"EvidenceSnapshot"', '"ProposalTemplate"', '"User"', '"checkout_attempts"', '"QATelemetry"', '"ProposalOutreach"', '"FollowUpEmailSend"'];
const removeTenant = ['"ProposalAcceptance"', '"ProposalView"', '"AuditTarget"', '"OutreachTemplatePerformance"', '"FailedWebhookEvent"', '"CartAbandonmentEvent"', '"PartnerDeliveredLead"'];
const removeTables = ['"CircuitBreakerState"', '"DeadLetterQueue"', '"AuditTrailEvent"'];

const renames = {
  '"failed_webhook_events"': '"FailedWebhookEvent"',
  '"processed_webhook_events"': '"ProcessedWebhookEvent"',
  '"cart_abandonment_events"': '"CartAbandonmentEvent"',
  '"pricing_plans"': '"PricingPlan"',
  '"subscriptions"': '"Subscription"',
  '"payments"': '"Payment"'
};

let lines = fs.readFileSync('temp_migration.sql', 'utf8').split('\n');
let out = [];

let currentTable = null;
let skipTable = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect table start
  const match = line.match(/^CREATE TABLE (".*?") \(/);
  if (match) {
    let tableName = match[1];
    if (renames[tableName]) {
      tableName = renames[tableName];
    }
    currentTable = tableName;
    if (removeTables.includes(currentTable)) {
      skipTable = true;
      continue;
    }
    out.push(line.replace(match[1], currentTable));
    continue;
  }

  // Detect table end
  if (line.match(/^\);/)) {
    if (skipTable) {
      skipTable = false;
      currentTable = null;
      continue;
    }
    currentTable = null;
  }

  if (skipTable) continue;

  // Inside table:
  if (currentTable) {
    if (makeNullable.includes(currentTable) && line.includes('"tenantId" TEXT NOT NULL')) {
      out.push(line.replace('"tenantId" TEXT NOT NULL', '"tenantId" TEXT'));
      continue;
    }
    
    if (removeTenant.includes(currentTable) && line.includes('"tenantId" TEXT')) {
      // Skip tenantId column declaration completely
      continue;
    }
    
    // Check if the previous line ended with a comma and we need to remove the comma
    // Actually, Prisma puts commas at the end. We'll just leave a trailing comma, postgres doesn't like it but Prisma usually doesn't have it on the last column.
  }

  // Outside table checks: indexes and constraints
  if (line.startsWith('CREATE INDEX') || line.startsWith('CREATE UNIQUE INDEX') || line.startsWith('ALTER TABLE')) {
    let shouldSkip = false;
    const skipIndicesFor = [...removeTenant, ...makeNullable];
    for (const t of skipIndicesFor) {
      if (line.includes('"' + t.replace(/"/g, '') + '_tenantId_') || (line.includes(t) && line.includes('FOREIGN KEY ("tenantId")'))) {
        // Only skip if the migration 20260315 actually creates it. 
        // 20260228 doesn't create indices, but 20260315 does.
        // Actually, it's safer to skip all tenantId indices in baseline and let the migrations create them.
        shouldSkip = true;
      }
    }
    // Also skip constraints added in 20260321_add_check_constraints
    if (line.includes('ADD CONSTRAINT "ProposalOutreach_score_check"') || 
        line.includes('ADD CONSTRAINT "Finding_impactScore_check"') ||
        line.includes('ADD CONSTRAINT "FindingEffectiveness_rates_check"') ||
        line.includes('ADD CONSTRAINT "OutreachTemplatePerformance_rates_check"')) {
        shouldSkip = true;
    }
    if (shouldSkip) continue;
  }
  
  let newLine = line;
  for (const [oldName, newName] of Object.entries(renames)) {
    // Replace table names in indexes and foreign keys
    newLine = newLine.split(oldName).join(newName);
  }
  out.push(newLine);
}

// Write to migration.sql
fs.writeFileSync('prisma/migrations/20260227000000_init/migration.sql', out.join('\n'));
console.log("Success");
