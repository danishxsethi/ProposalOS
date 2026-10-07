#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const region = process.env.AWS_REGION;
const expectedAccount = process.env.EXPECTED_AWS_ACCOUNT_ID;
const expectedInstance = process.env.EXPECTED_RDS_IDENTIFIER;
const targetDatabase = process.env.TARGET_DATABASE;
const endpoint = process.env.RDS_ENDPOINT;
const port = process.env.RDS_PORT || '5432';

if (region !== 'us-east-2' || expectedAccount !== '410432886960') {
  throw new Error('Refusing to migrate outside the approved ProposalOS production AWS account and region.');
}

if (expectedInstance !== 'proposalos-production-db' || targetDatabase !== 'proposal_engine') {
  throw new Error('Refusing to migrate outside the approved ProposalOS production database.');
}

if (!endpoint || !/^proposalos-production-db\.[a-z0-9-]+\.us-east-2\.rds\.amazonaws\.com$/.test(endpoint)) {
  throw new Error('Refusing to migrate an endpoint outside the approved production RDS instance.');
}

let masterSecret;
try {
  masterSecret = JSON.parse(process.env.RDS_MASTER_SECRET_JSON || '');
} catch {
  throw new Error('The production RDS master secret is unavailable or malformed.');
}

if (
  !masterSecret.username ||
  !masterSecret.password ||
  masterSecret.host !== endpoint ||
  Number(masterSecret.port) !== Number(port) ||
  (masterSecret.dbname && masterSecret.dbname !== targetDatabase)
) {
  throw new Error('The RDS secret metadata does not match the approved production endpoint and database.');
}

process.env.DATABASE_URL =
  `postgresql://${encodeURIComponent(masterSecret.username)}:${encodeURIComponent(masterSecret.password)}` +
  `@${endpoint}:${port}/${encodeURIComponent(targetDatabase)}?sslmode=require`;

// Keep credentials in the task environment only; never print the generated URL or secret.
delete process.env.RDS_MASTER_SECRET_JSON;
delete masterSecret;
console.log(`Running Prisma migrations against the approved production database at ${endpoint}.`);

const result = spawnSync('prisma', ['migrate', 'deploy'], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
