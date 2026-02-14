#!/usr/bin/env node
/**
 * Print the first tenant ID for use in DEFAULT_TENANT_ID or x-tenant-id.
 * Requires DB to be running. Run: node scripts/get-tenant-id.js
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error('No tenant found. Run: npx prisma db seed');
    process.exit(1);
  }
  console.log(tenant.id);
  console.error(`# ${tenant.name} — add to .env.local: DEFAULT_TENANT_ID=${tenant.id}`);
}

main()
  .catch((e) => {
    console.error('DB error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
