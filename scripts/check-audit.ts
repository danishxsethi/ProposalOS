import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Querying latest 20 audits in database...');
  const audits = await prisma.audit.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      businessName: true,
      businessUrl: true,
      status: true,
      modulesCompleted: true,
      modulesFailed: true,
      createdAt: true,
    },
  });
  console.log('Latest 20 Audits:', JSON.stringify(audits, null, 2));

  console.log('\nQuerying latest 20 audit jobs in database...');
  const auditJobs = await prisma.auditJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log('Latest 20 Audit Jobs:', JSON.stringify(auditJobs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
