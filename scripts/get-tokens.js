const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const proposals = await prisma.proposal.findMany({
        take: 10,
        include: { audit: { select: { businessName: true } } },
    });
    console.log('Proposals:');
    proposals.forEach(p => {
        console.log(`  - ${p.audit?.businessName || 'Unknown'}: http://localhost:3000/proposal/${p.webLinkToken}`);
    });
    await prisma.$disconnect();
}

main();
