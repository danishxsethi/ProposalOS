import { generateApiKey } from '../lib/auth/apiKeys';
import { prisma } from '../lib/prisma';

async function main() {
    let tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: 'E2E Testing Tenant',
                planTier: 'agency'
            }
        });
        console.log("Created active tenant:", tenant.id);
    }

    const { key, hash, prefix } = generateApiKey();
    await prisma.apiKey.create({
        data: {
            tenantId: tenant.id,
            keyHash: hash,
            keyPrefix: prefix,
            name: 'E2E Test Key',
            scopes: ['audit:write', 'audit:read', 'proposal:write', 'proposal:read'],
            rateLimitPerDay: 1000
        }
    });

    console.log(key);
}
main().finally(() => prisma.$disconnect());
