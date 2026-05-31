import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { PlanCatalogService } from '@/lib/stripe/PlanCatalogService';
import { getTenantId, runWithTenantAsync } from '@/lib/tenant/context';

export async function checkAndDecrementQuota(
  tenantId: string,
  tx: Prisma.TransactionClient,
  countRequested: number = 1
): Promise<void> {
  // 1. Lock the Tenant row to serialize quota check and audit creation
  await tx.$executeRawUnsafe(`SELECT id FROM "Tenant" WHERE id = $1 FOR UPDATE`, tenantId);

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Handle trial logic override
  if (tenant.status === 'trial') {
    const trialLimit = 100;
    const count = await tx.audit.count({
      where: { tenantId, status: { not: 'FAILED' } },
    });
    if (count + countRequested > trialLimit) {
      throw new Error(`Quota exceeded: Pro Trial limit of ${trialLimit} audits would be exceeded.`);
    }
    return;
  }

  const planTier = tenant.planTier || 'free';
  const plan = PlanCatalogService.getPlanById(planTier);
  const limit = plan?.limits?.audits ?? 3;

  // Retrieve active subscription to find current billing cycle start/end
  const sub = await tx.subscription.findFirst({
    where: { tenantId },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  const billingCycleStart =
    sub?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const billingCycleEnd =
    sub?.currentPeriodEnd || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  // Count non-failed audits within current billing cycle
  const count = await tx.audit.count({
    where: {
      tenantId,
      status: { not: 'FAILED' },
      createdAt: {
        gte: billingCycleStart,
        lte: billingCycleEnd,
      },
    },
  });

  if (count + countRequested > limit) {
    throw new Error(
      `Quota exceeded: Requesting ${countRequested} audits, but only ${Math.max(
        0,
        limit - count
      )} remaining of your ${limit} audit monthly limit.`
    );
  }
}

export async function checkAuditLimit() {
  const tenantId = await getTenantId();
  if (!tenantId)
    return { allowed: false, current: 0, limit: 0, planTier: 'unknown', reason: 'No Tenant ID' };

  const tenant = await runWithTenantAsync(tenantId, () =>
    prisma.tenant.findUnique({
      where: { id: tenantId },
    })
  );

  if (!tenant)
    return {
      allowed: false,
      current: 0,
      limit: 0,
      planTier: 'unknown',
      reason: 'Tenant Not Found',
    };

  // Handle Trial Logic: if status is trial, grant Pro access
  if (tenant.status === 'trial') {
    const trialLimit = 100;
    const count = await runWithTenantAsync(tenantId, () =>
      prisma.audit.count({
        where: { tenantId, status: { not: 'FAILED' } },
      })
    );
    return {
      allowed: count < trialLimit,
      current: count,
      limit: trialLimit,
      planTier: 'trial',
    };
  }

  const planTier = tenant.planTier || 'free';
  const plan = PlanCatalogService.getPlanById(planTier);
  const limit = plan?.limits?.audits ?? 3;

  // Retrieve active subscription
  const sub = await runWithTenantAsync(tenantId, () =>
    prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { currentPeriodEnd: 'desc' },
    })
  );

  const billingCycleStart =
    sub?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const billingCycleEnd =
    sub?.currentPeriodEnd || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  const count = await runWithTenantAsync(tenantId, () =>
    prisma.audit.count({
      where: {
        tenantId,
        status: { not: 'FAILED' },
        createdAt: {
          gte: billingCycleStart,
          lte: billingCycleEnd,
        },
      },
    })
  );

  if (count >= limit) {
    return {
      allowed: false,
      current: count,
      limit,
      planTier: tenant.planTier,
      reason: `Monthly audit limit reached (${limit}). Please upgrade your plan.`,
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

  const tenant = await runWithTenantAsync(tenantId, () =>
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: true },
    })
  );

  if (!tenant) return { allowed: false, current: 0, limit: 0, planTier: 'unknown' };

  // Handle Trial Logic
  if (tenant.status === 'trial') {
    return {
      allowed: tenant.users.length < 100,
      current: tenant.users.length,
      limit: 100,
      planTier: 'trial',
    };
  }

  const planTier = tenant.planTier || 'free';
  const plan = PlanCatalogService.getPlanById(planTier);

  const activeUsers = tenant.users.length;
  const pendingInvites = 0; // TODO: add invitations relation to Tenant when schema supports it
  const totalSeatsUsed = activeUsers + pendingInvites;
  const limit = plan?.limits?.seats || 1;

  return {
    allowed: totalSeatsUsed < limit,
    current: totalSeatsUsed,
    limit,
    planTier: tenant.planTier,
    reason:
      totalSeatsUsed >= limit
        ? `Seat limit reached (${limit}). Upgrade to add more members.`
        : undefined,
  };
}
