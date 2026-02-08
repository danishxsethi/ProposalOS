import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { getPlanById } from './stripe';

export async function checkAuditLimit() {
    const tenantId = await getTenantId();
    if (!tenantId) return { allowed: false, current: 0, limit: 0, planTier: 'unknown', reason: 'No Tenant ID' };

    const prisma = createScopedPrisma(tenantId);

    // Fetch tenant to get planTier
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
    });

    if (!tenant) return { allowed: false, current: 0, limit: 0, planTier: 'unknown', reason: 'Tenant Not Found' };

    // Handle Trial Logic: if status is trial, grant Pro access
    const effectiveTier = tenant.status === 'trial' ? 'trial' : tenant.planTier;
    const plan = getPlanById(effectiveTier);

    // Count audits in current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const count = await prisma.audit.count({
        where: {
            tenantId,
            createdAt: {
                gte: startOfMonth,
            },
        },
    });

    const limit = plan?.limits?.audits || 0;

    if (count >= limit) {
        return {
            allowed: false,
            current: count,
            limit,
            planTier: tenant.planTier,
            reason: `Monthly audit limit reached (${limit}). Please upgrade your plan.`
        };
    }

    return {
        allowed: true,
        current: count,
        limit,
        planTier: tenant.planTier,
    };
}

export async function checkSeatLimit() {
    const tenantId = await getTenantId();
    if (!tenantId) return { allowed: false, current: 0, limit: 0, planTier: 'unknown' };

    const prisma = createScopedPrisma(tenantId);

    // Fetch tenant to get planTier
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
            users: true,
            invitations: {
                where: {
                    expiresAt: { gt: new Date() },
                    acceptedAt: null
                }
            }
        },
    });

    if (!tenant) return { allowed: false, current: 0, limit: 0, planTier: 'unknown' };

    // Handle Trial Logic
    const effectiveTier = tenant.status === 'trial' ? 'trial' : tenant.planTier;
    const plan = getPlanById(effectiveTier);

    const activeUsers = tenant.users.length;
    const pendingInvites = tenant.invitations.length;
    const totalSeatsUsed = activeUsers + pendingInvites;
    const limit = plan?.limits?.seats || 1;

    return {
        allowed: totalSeatsUsed < limit,
        current: totalSeatsUsed,
        limit,
        planTier: tenant.planTier,
        reason: totalSeatsUsed >= limit ? `Seat limit reached (${limit}). Upgrade to add more members.` : undefined
    };
}
