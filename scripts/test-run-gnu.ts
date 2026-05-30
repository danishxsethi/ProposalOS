import { PrismaClient } from '@prisma/client';
import { runAudit } from '../lib/audit/runner';
import { runWithTenantAsync } from '../lib/tenant/context';

const prisma = new PrismaClient();

async function main() {
  const tenantId = '40aaeade-8c22-4848-ae44-79fb030b4553'; // Use the tenant ID from the previous audit
  console.log(`Using tenantId: ${tenantId}`);

  // Create a new audit for GNU
  const audit = await prisma.audit.create({
    data: {
      tenantId,
      businessName: 'The GNU Operating System',
      businessCity: 'Boston',
      businessUrl: 'https://www.gnu.org',
      businessIndustry: 'software',
      status: 'QUEUED',
      apiCostCents: 0,
    },
  });

  console.log(`Created audit record: ${audit.id}`);
  console.log('Running runAudit inside runWithTenantAsync...');
  try {
    const result = await runWithTenantAsync(tenantId, () => runAudit(audit.id));
    console.log('runAudit completed successfully with result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('runAudit threw an exception:', err);
  }

  // Fetch the final state of the audit record
  const finalRecord = await prisma.audit.findUnique({
    where: { id: audit.id },
  });
  console.log('Final audit record in DB:', JSON.stringify(finalRecord, null, 2));
}

main()
  .catch((e) => {
    console.error('Fatal outer exception:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
