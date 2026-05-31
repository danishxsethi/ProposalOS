import { prisma } from '@/lib/prisma';
import { PlanCatalogService } from '@/lib/stripe/PlanCatalogService';
import { runWithTenantAsync } from '@/lib/tenant/context';

export interface EntitlementCheck {
  allowed: boolean;
  status:
    | 'active'
    | 'suspended'
    | 'past_due'
    | 'unpaid'
    | 'canceled'
    | 'trial'
    | 'free'
    | 'unknown';
  inGracePeriod: boolean;
  planTier: string;
  limit: number;
  current: number;
  remaining: number;
  reason?: string;
  features: {
    branding: 'basic' | 'full' | 'whitelabel';
    batchMode: boolean;
    apiAccess: boolean;
  };
}

export class EntitlementService {
  static async getEntitlements(tenantId: string): Promise<EntitlementCheck> {
    return await runWithTenantAsync(tenantId, async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          subscriptions: {
            orderBy: { currentPeriodEnd: 'desc' },
            take: 1,
          },
        },
      });

      if (!tenant) {
        return {
          allowed: false,
          status: 'unknown',
          inGracePeriod: false,
          planTier: 'free',
          limit: 3,
          current: 0,
          remaining: 0,
          reason: 'Tenant not found',
          features: { branding: 'basic', batchMode: false, apiAccess: false },
        };
      }

      // Resolve effective plan
      const planTier = tenant.planTier || 'free';
      const plan = PlanCatalogService.getPlanById(planTier);
      const defaultFeatures = {
        branding: (plan?.limits?.branding || 'basic') as 'basic' | 'full' | 'whitelabel',
        batchMode: plan?.limits?.batchMode || false,
        apiAccess: plan?.limits?.apiAccess || false,
      };

      const limit = plan?.limits?.audits ?? 3; // Default free tier limit of 3

      // Handle custom trial override
      if (tenant.status === 'trial') {
        const trialLimit = 100;
        const count = await prisma.audit.count({
          where: { tenantId, status: { not: 'FAILED' } },
        });
        return {
          allowed: count < trialLimit,
          status: 'trial',
          inGracePeriod: false,
          planTier: 'trial',
          limit: trialLimit,
          current: count,
          remaining: Math.max(0, trialLimit - count),
          features: { branding: 'full', batchMode: true, apiAccess: false },
        };
      }

      // Check active subscription from webhook or fallback to tenant state
      const sub = tenant.subscriptions[0];
      const subStatus = sub?.status || tenant.subscriptionStatus || 'free';

      // Determine current billing cycle start/end
      const billingCycleStart =
        sub?.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const billingCycleEnd =
        sub?.currentPeriodEnd || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

      // Count only non-failed audits within current cycle
      const current = await prisma.audit.count({
        where: {
          tenantId,
          status: { not: 'FAILED' },
          createdAt: {
            gte: billingCycleStart,
            lte: billingCycleEnd,
          },
        },
      });

      const remaining = Math.max(0, limit - current);

      // Grace period checking for 'past_due'
      let inGracePeriod = false;
      if (subStatus === 'past_due' && tenant.gracePeriodEndsAt) {
        const now = new Date();
        if (now < new Date(tenant.gracePeriodEndsAt)) {
          inGracePeriod = true;
        }
      }

      // Suspend logic
      const isSuspended =
        tenant.status === 'suspended' ||
        subStatus === 'canceled' ||
        subStatus === 'unpaid' ||
        (subStatus === 'past_due' && !inGracePeriod);

      if (isSuspended) {
        return {
          allowed: false,
          status: subStatus as any,
          inGracePeriod,
          planTier,
          limit,
          current,
          remaining,
          reason: 'Subscription is suspended. Please update payment method or upgrade.',
          features: defaultFeatures,
        };
      }

      // Quota check
      if (current >= limit) {
        return {
          allowed: false,
          status: subStatus as any,
          inGracePeriod,
          planTier,
          limit,
          current,
          remaining: 0,
          reason: `Quota exhausted: ${current}/${limit} audits used this billing cycle. Please upgrade your plan.`,
          features: defaultFeatures,
        };
      }

      return {
        allowed: true,
        status: (subStatus === 'free' ? 'free' : subStatus) as any,
        inGracePeriod,
        planTier,
        limit,
        current,
        remaining,
        features: defaultFeatures,
      };
    });
  }
}
