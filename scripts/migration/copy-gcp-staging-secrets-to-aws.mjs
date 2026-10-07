import { execFileSync } from 'node:child_process';

import { PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { fromIni } from '@aws-sdk/credential-provider-ini';

const awsRegion = 'us-east-2';
const awsProfile = 'proposalos-migration';
const gcpProject = 'proposal-487522';
const secrets = [
  ['ADMIN_SECRET', 'ADMIN_SECRET'],
  ['API_KEY', 'proposal-engine-staging-api-key'],
  ['AUDIT_LOG_SIGNING_SECRET', 'proposal-engine-staging-audit-log-signing-secret'],
  // These keys must match the production snapshot so existing encrypted fields remain readable.
  ['AUDIT_TRAIL_ENCRYPTION_KEY', 'AUDIT_TRAIL_ENCRYPTION_KEY'],
  ['CRON_SECRET', 'proposal-engine-staging-cron-secret'],
  ['FIELD_ENCRYPTION_KEY_ID', 'FIELD_ENCRYPTION_KEY_ID'],
  ['FIELD_ENCRYPTION_PRIMARY_KEY', 'FIELD_ENCRYPTION_PRIMARY_KEY'],
  ['INTERNAL_OPS_KEY', 'INTERNAL_OPS_KEY'],
  ['NEXTAUTH_SECRET', 'proposal-engine-staging-nextauth-secret'],
  ['RESEND_API_KEY', 'proposal-engine-staging-resend-api-key'],
  ['SERP_API_KEY', 'SERP_API_KEY'],
  ['STRIPE_SECRET_KEY', 'proposal-engine-staging-stripe-secret-key'],
  ['STRIPE_WEBHOOK_SECRET', 'proposal-engine-staging-stripe-webhook-secret'],
  ['WORKER_SECRET', 'proposal-engine-staging-worker-secret'],
];

const client = new SecretsManagerClient({
  region: awsRegion,
  credentials: fromIni({ profile: awsProfile }),
});

const gcloudExecutable = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
let transferred = 0;

for (const [envName, gcpSecretName] of secrets) {
  let secretBytes;
  try {
    secretBytes = execFileSync(
      gcloudExecutable,
      ['secrets', 'versions', 'access', 'latest', `--secret=${gcpSecretName}`, `--project=${gcpProject}`],
      { encoding: 'buffer', maxBuffer: 1024 * 1024, shell: process.platform === 'win32' },
    );
  } catch {
    throw new Error(`Could not read GCP Secret Manager entry ${gcpSecretName}.`);
  }

  try {
    await client.send(
      new PutSecretValueCommand({
        SecretId: `proposalos/app/staging/${envName}`,
        SecretString: secretBytes.toString('utf8'),
      }),
    );
  } catch (error) {
    const code = error instanceof Error ? error.name : 'UnknownError';
    throw new Error(`Could not store AWS staging secret ${envName} (${code}).`);
  } finally {
    secretBytes.fill(0);
  }

  transferred += 1;
  process.stdout.write(`Stored ${envName} in AWS Secrets Manager.\n`);
}

process.stdout.write(`Completed ${transferred} staging secret transfers. No secret values were printed.\n`);
