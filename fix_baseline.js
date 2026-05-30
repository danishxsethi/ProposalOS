const fs = require('fs');

const makeNullable = ['Finding', 'Proposal', 'EvidenceSnapshot', 'ProposalTemplate', 'User', 'checkout_attempts', 'QATelemetry', 'ProposalOutreach', 'FollowUpEmailSend'];
const removeTenant = ['ProposalAcceptance', 'ProposalView', 'AuditTarget', 'OutreachTemplatePerformance', 'FailedWebhookEvent', 'CartAbandonmentEvent', 'PartnerDeliveredLead'];
const removeTables = ['CircuitBreakerState', 'DeadLetterQueue', 'AuditTrailEvent'];

// Map current DB names in temp_migration.sql to the ones expected by migrations
const renames = {
  'failed_webhook_events': 'FailedWebhookEvent',
  'processed_webhook_events': 'ProcessedWebhookEvent',
  'cart_abandonment_events': 'CartAbandonmentEvent',
  'pricing_plans': 'PricingPlan',
  'subscriptions': 'Subscription',
  'payments': 'Payment'
};

const lines = fs.readFileSync('temp_migration.sql', 'utf8').split('\n');
const out = [];

let currentTable = null;
let skipTable = false;

for (let line of lines) {
  // 1. Rename tables in CREATE TABLE
  let match = line.match(/^CREATE TABLE "(.*?)" \(/);
  if (match) {
    let name = match[1];
    if (renames[name]) name = renames[name];
    currentTable = name;
    if (removeTables.includes(currentTable)) {
      skipTable = true;
      continue;
    }
    out.push(`CREATE TABLE "${currentTable}" (`);
    continue;
  }

  if (line.trim() === ');') {
    if (skipTable) {
      skipTable = false;
    } else {
      out.push(line);
    }
    currentTable = null;
    continue;
  }

  if (skipTable) continue;

  if (currentTable) {
    // 2. Make tenantId nullable if in list
    if (makeNullable.includes(currentTable) && line.includes('"tenantId" TEXT NOT NULL')) {
      out.push(line.replace('"tenantId" TEXT NOT NULL', '"tenantId" TEXT'));
      continue;
    }
    // 3. Remove tenantId if in list
    if (removeTenant.includes(currentTable) && line.includes('"tenantId" TEXT')) {
      continue;
    }
  }

  // 4. Global renames for indices and foreign keys
  let newLine = line;
  for (const [oldName, newName] of Object.entries(renames)) {
    newLine = newLine.split(`"${oldName}"`).join(`"${newName}"`);
  }

  // 5. Skip indices and constraints for removed tenantIds
  let shouldSkip = false;
  for (const t of [...removeTenant, ...makeNullable]) {
    if (newLine.includes(`"${t}_tenantId_idx"`) || 
        newLine.includes(`"${t}_tenantId_fkey"`) ||
        (newLine.includes(`"${t}"`) && newLine.includes('FOREIGN KEY ("tenantId")'))) {
      shouldSkip = true;
      break;
    }
  }
  
  // Skip check constraints added in 20260321
  if (newLine.includes('ADD CONSTRAINT') && (
      newLine.includes('_score_check') || 
      newLine.includes('_check')
  )) {
      shouldSkip = true;
  }

  if (!shouldSkip) {
    out.push(newLine);
  }
}

fs.writeFileSync('prisma/migrations/20260227000000_init/migration.sql', out.join('\n'));
console.log("Reconstructed baseline migration successfully.");
