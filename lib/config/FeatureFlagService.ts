import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

export class FeatureFlagService {
  private static cache = new Map<string, { value: boolean; expiresAt: number }>();
  private static TTL_MS = 60 * 1000; // 1 minute cache TTL

  /**
   * Check if a feature flag is enabled.
   * Priority:
   * 1. process.env (as string 'true' / 'false')
   * 2. Local memory cache
   * 3. DB (FeatureFlag table)
   * 4. Default hardcoded fallback
   */
  public static async isEnabled(key: string): Promise<boolean> {
    // 1. Env override first
    const envVal = process.env[key];
    if (envVal !== undefined) {
      return envVal === 'true';
    }

    // 2. Cache hit check
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    // 3. Database lookup
    try {
      const flag = await runWithTenantBypass('FeatureFlagService.get', async () => {
        return await prisma.featureFlag.findUnique({
          where: { key },
        });
      });

      const dbValue = flag ? flag.value === 'true' : this.getDefaultValue(key);
      this.cache.set(key, { value: dbValue, expiresAt: now + this.TTL_MS });
      return dbValue;
    } catch (err) {
      // Return default fallback in case of errors (e.g. database not ready)
      return this.getDefaultValue(key);
    }
  }

  /**
   * Manually invalidate cache entries
   */
  public static invalidateCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Set flag value dynamically (mainly used for testing or runtime toggle)
   */
  public static async setFlag(key: string, value: boolean): Promise<void> {
    const valueStr = value ? 'true' : 'false';
    await runWithTenantBypass('FeatureFlagService.set', async () => {
      await prisma.featureFlag.upsert({
        where: { key },
        update: { value: valueStr },
        create: { key, value: valueStr },
      });
    });
    this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
  }

  /**
   * Default hardcoded fallbacks as per the prompt specification
   */
  private static getDefaultValue(key: string): boolean {
    switch (key) {
      case 'AUTOMATION_SELF_SERVE_ONBOARDING':
        return true;
      case 'AUTOMATION_AUTO_QA_PROMOTION':
        return true;
      case 'KILL_SWITCH_FORCE_MANUAL_MODE':
        return false;
      default:
        return false;
    }
  }
}
