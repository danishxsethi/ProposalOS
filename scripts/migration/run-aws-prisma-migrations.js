#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const targetDatabase = process.env.TARGET_DATABASE;
const endpoint = process.env.RDS_ENDPOINT;
const port = process.env.RDS_PORT || '5432';

if (targetDatabase !== 'proposal_engine') {
  throw new Error('Refusing to migrate a database outside the approved ProposalOS staging database.');
}

if (!endpoint || !/^proposalos-staging-db\./.test(endpoint)) {
  throw new Error('Refusing to migrate an endpoint outside the ProposalOS staging RDS instance.');
}

let masterSecret;
try {
  masterSecret = JSON.parse(process.env.RDS_MASTER_SECRET_JSON || '');
} catch {
  throw new Error('The staging RDS master secret is unavailable or malformed.');
}

if (!masterSecret.username || !masterSecret.password) {
  throw new Error('The staging RDS master secret is missing its username or password.');
}

process.env.DATABASE_URL =
  `postgresql://${encodeURIComponent(masterSecret.username)}:${encodeURIComponent(masterSecret.password)}` +
  `@${endpoint}:${port}/${encodeURIComponent(targetDatabase)}?sslmode=require`;

// Keep credentials in the environment only; never print the generated URL.
delete process.env.RDS_MASTER_SECRET_JSON;
console.log(`Running Prisma migrations against staging database ${targetDatabase} at ${endpoint}.`);

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
