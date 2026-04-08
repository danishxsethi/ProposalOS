import Stripe from 'stripe';

import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe/stripe';

// Currency configuration per locale
export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale: string;
  decimals: number;
}

export const LOCALE_CURRENCY_MAP: Record<string, CurrencyConfig> = {
  'en-US': { code: 'USD', symbol: '$', locale: 'en-US', decimals: 2 },
  'en-GB': { code: 'GBP', symbol: '£', locale: 'en-GB', decimals: 2 },
  'en-CA': { code: 'CAD', symbol: 'CA$', locale: 'en-CA', decimals: 2 },
  'en-AU': { code: 'AUD', symbol: 'A$', locale: 'en-AU', decimals: 2 },
  'de-DE': { code: 'EUR', symbol: '€', locale: 'de-DE', decimals: 2 },
  'fr-FR': { code: 'EUR', symbol: '€', locale: 'fr-FR', decimals: 2 },
  'es-ES': { code: 'EUR', symbol: '€', locale: 'es-ES', decimals: 2 },
  'ar-SA': { code: 'SAR', symbol: 'ر.س', locale: 'ar-SA', decimals: 2 },
  'he-IL': { code: 'ILS', symbol: '₪', locale: 'he-IL', decimals: 2 },
};

// Supported currencies for Stripe
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SAR', 'ILS'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: number; // in base currency (USD)
  prices?: Record<SupportedCurrency, number>; // Multi-currency prices
  features: string[];
  limits: {
    audits: number;
    seats: number;
    branding: string;
    batchMode: boolean;
    apiAccess?: boolean;
  };
}

export interface PricingPlanConfig {
  id: string;
  name: string;
  description: string;
  type: 'saas' | 'proposal';
  interval?: 'month' | 'year';
  tiers: PricingTier[];
  features: Record<string, any>;
  limits: Record<string, any>;
  status: 'active' | 'inactive' | 'archived';
  sortOrder: number;
  stripeProductId?: string;
  stripePriceIds?: Record<string, Record<SupportedCurrency, string>>; // tierId -> currency -> priceId
}

export class PricingService {
  /**
   * Get currency config for a locale
   */
  static getCurrencyForLocale(locale: string): CurrencyConfig {
    return LOCALE_CURRENCY_MAP[locale] || LOCALE_CURRENCY_MAP['en-US'];
  }

  /**
   * Format price for a specific locale/currency
   */
  static formatPrice(amount: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Convert USD price to another currency using configured rates
   */
  static convertPrice(usdAmount: number, targetCurrency: SupportedCurrency): number {
    // Exchange rates relative to USD (update these regularly or fetch from API)
    const EXCHANGE_RATES: Record<SupportedCurrency, number> = {
      USD: 1.0,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.36,
      AUD: 1.53,
      SAR: 3.75,
      ILS: 3.67,
    };

    const rate = EXCHANGE_RATES[targetCurrency] || 1.0;
    return Math.round(usdAmount * rate * 100) / 100;
  }

  /**
   * Create a new pricing plan with multi-currency Stripe integration
   */
  static async createPricingPlan(
    config: Omit<PricingPlanConfig, 'id'>
  ): Promise<PricingPlanConfig> {
    // Create Stripe product first
    let stripeProduct: Stripe.Product | undefined;
    if (config.type === 'saas' || config.type === 'proposal') {
      stripeProduct = await stripe.products.create({
        name: config.name,
        description: config.description,
        type: 'service',
      });
    }

    // Create Stripe prices for each tier and currency
    const stripePriceIds: Record<string, Record<SupportedCurrency, string>> = {};
    if (stripeProduct) {
      for (const tier of config.tiers) {
        stripePriceIds[tier.id] = {} as Record<SupportedCurrency, string>;

        for (const currency of SUPPORTED_CURRENCIES) {
          const priceInCurrency =
            tier.prices?.[currency] ?? this.convertPrice(tier.price, currency);

          const price = await stripe.prices.create({
            unit_amount: Math.round(priceInCurrency * 100), // Convert to cents/smallest unit
            currency: currency.toLowerCase(),
            product: stripeProduct.id,
            recurring: config.interval
              ? {
                  interval: config.interval,
                  interval_count: 1,
                }
              : undefined,
            metadata: {
              tierId: tier.id,
              planId: config.name.toLowerCase().replace(/\s+/g, '-'),
              currency: currency,
            },
          });
          stripePriceIds[tier.id][currency] = price.id;
        }
      }
    }

    // Save to database
    const pricingPlan = await prisma.pricingPlan.create({
      data: {
        name: config.name,
        description: config.description,
        type: config.type,
        interval: config.interval,
        status: config.status,
        sortOrder: config.sortOrder,
        tiers: config.tiers,
        features: config.features,
        limits: config.limits,
        stripeProductId: stripeProduct?.id,
        stripePriceIds: stripePriceIds as any,
      },
    });

    return {
      id: pricingPlan.id,
      ...config,
      stripeProductId: stripeProduct?.id,
      stripePriceIds,
    };
  }

  /**
   * Get active pricing plans by type
   */
  static async getPricingPlans(type: 'saas' | 'proposal'): Promise<PricingPlanConfig[]> {
    const plans = await prisma.pricingPlan.findMany({
      where: {
        type,
        status: 'active',
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      type: plan.type as 'saas' | 'proposal',
      interval: plan.interval as 'month' | 'year' | undefined,
      tiers: plan.tiers as PricingTier[],
      features: plan.features as Record<string, any>,
      limits: plan.limits as Record<string, any>,
      status: plan.status as 'active' | 'inactive' | 'archived',
      sortOrder: plan.sortOrder,
      stripeProductId: plan.stripeProductId || undefined,
      stripePriceIds: plan.stripePriceIds as
        | Record<string, Record<SupportedCurrency, string>>
        | undefined,
    }));
  }

  /**
   * Get a specific pricing plan by ID
   */
  static async getPricingPlanById(id: string): Promise<PricingPlanConfig | null> {
    const plan = await prisma.pricingPlan.findUnique({
      where: { id },
    });

    if (!plan) return null;

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      type: plan.type as 'saas' | 'proposal',
      interval: plan.interval as 'month' | 'year' | undefined,
      tiers: plan.tiers as PricingTier[],
      features: plan.features as Record<string, any>,
      limits: plan.limits as Record<string, any>,
      status: plan.status as 'active' | 'inactive' | 'archived',
      sortOrder: plan.sortOrder,
      stripeProductId: plan.stripeProductId || undefined,
      stripePriceIds: plan.stripePriceIds as
        | Record<string, Record<SupportedCurrency, string>>
        | undefined,
    };
  }

  /**
   * Get price for a specific tier and currency
   */
  static async getPriceForCurrency(
    planId: string,
    tierId: string,
    currency: SupportedCurrency
  ): Promise<{
    price: number;
    stripePriceId: string;
    formatted: string;
  } | null> {
    const plan = await this.getPricingPlanById(planId);
    if (!plan) return null;

    const tier = plan.tiers.find((t) => t.id === tierId);
    if (!tier) return null;

    const priceInCurrency = tier.prices?.[currency] ?? this.convertPrice(tier.price, currency);
    const stripePriceId = plan.stripePriceIds?.[tierId]?.[currency];
    const currencyConfig =
      LOCALE_CURRENCY_MAP[
        Object.keys(LOCALE_CURRENCY_MAP).find(
          (key) => LOCALE_CURRENCY_MAP[key].code === currency
        ) || 'en-US'
      ];

    return {
      price: priceInCurrency,
      stripePriceId: stripePriceId || '',
      formatted: this.formatPrice(priceInCurrency, currency, currencyConfig.locale),
    };
  }

  /**
   * Update a pricing plan
   */
  static async updatePricingPlan(
    id: string,
    updates: Partial<PricingPlanConfig>
  ): Promise<PricingPlanConfig> {
    const existingPlan = await prisma.pricingPlan.findUnique({
      where: { id },
    });

    if (!existingPlan) {
      throw new Error(`Pricing plan with id ${id} not found`);
    }

    // Update Stripe product if name/description changed
    let updatedStripeProduct = existingPlan.stripeProductId;
    if (updates.name || updates.description) {
      await stripe.products.update(existingPlan.stripeProductId!, {
        name: updates.name || existingPlan.name,
        description: updates.description || existingPlan.description,
      });
    }

    // Update the plan in database
    const updatedPlan = await prisma.pricingPlan.update({
      where: { id },
      data: {
        name: updates.name,
        description: updates.description,
        interval: updates.interval,
        status: updates.status,
        sortOrder: updates.sortOrder,
        tiers: updates.tiers,
        features: updates.features,
        limits: updates.limits,
        stripePriceIds: updates.stripePriceIds,
      },
    });

    return {
      id: updatedPlan.id,
      name: updatedPlan.name,
      description: updatedPlan.description,
      type: updatedPlan.type as 'saas' | 'proposal',
      interval: updatedPlan.interval as 'month' | 'year' | undefined,
      tiers: updatedPlan.tiers as PricingTier[],
      features: updatedPlan.features as Record<string, any>,
      limits: updatedPlan.limits as Record<string, any>,
      status: updatedPlan.status as 'active' | 'inactive' | 'archived',
      sortOrder: updatedPlan.sortOrder,
      stripeProductId: updatedStripeProduct || undefined,
      stripePriceIds: updatedPlan.stripePriceIds as
        | Record<string, Record<SupportedCurrency, string>>
        | undefined,
    };
  }

  /**
   * Get the recommended plan based on diagnosis data
   */
  static async getRecommendedPlan(
    diagnosisData: any,
    type: 'saas' | 'proposal' = 'saas'
  ): Promise<PricingPlanConfig | null> {
    const plans = await this.getPricingPlans(type);

    if (!plans.length) return null;

    // Simple recommendation logic - could be enhanced based on diagnosis data
    const sortedPlans = plans.sort((a, b) => {
      const tierCountDiff = b.tiers.length - a.tiers.length;
      if (tierCountDiff !== 0) return tierCountDiff;

      const aHighestTier = a.tiers[a.tiers.length - 1];
      const bHighestTier = b.tiers[b.tiers.length - 1];
      return (bHighestTier?.features?.length || 0) - (aHighestTier?.features?.length || 0);
    });

    return sortedPlans[0];
  }

  /**
   * Get pricing tier by ID from a plan
   */
  static async getPricingTier(planId: string, tierId: string): Promise<PricingTier | null> {
    const plan = await this.getPricingPlanById(planId);
    if (!plan) return null;

    const tier = plan.tiers.find((t) => t.id === tierId);
    return tier || null;
  }

  /**
   * Sync pricing plan with Stripe (update prices for all currencies if needed)
   */
  static async syncWithStripe(planId: string): Promise<void> {
    const plan = await this.getPricingPlanById(planId);
    if (!plan || !plan.stripeProductId) {
      throw new Error(`Plan ${planId} not found or not connected to Stripe`);
    }

    const updatedPriceIds: Record<string, Record<SupportedCurrency, string>> = {};

    for (const tier of plan.tiers) {
      updatedPriceIds[tier.id] = {} as Record<SupportedCurrency, string>;

      for (const currency of SUPPORTED_CURRENCIES) {
        const expectedPriceCents = Math.round(
          (tier.prices?.[currency] ?? this.convertPrice(tier.price, currency)) * 100
        );
        const existingPriceId = plan.stripePriceIds?.[tier.id]?.[currency];

        if (existingPriceId) {
          try {
            const existingPrice = await stripe.prices.retrieve(existingPriceId);
            if (existingPrice.unit_amount === expectedPriceCents) {
              updatedPriceIds[tier.id][currency] = existingPriceId;
              continue;
            }
          } catch (error) {
            // Price doesn't exist, create new one
          }
        }

        // Create new price for this currency
        const newPrice = await stripe.prices.create({
          unit_amount: expectedPriceCents,
          currency: currency.toLowerCase(),
          product: plan.stripeProductId,
          recurring: plan.interval
            ? {
                interval: plan.interval,
                interval_count: 1,
              }
            : undefined,
          metadata: {
            tierId: tier.id,
            planId: plan.name.toLowerCase().replace(/\s+/g, '-'),
            currency: currency,
          },
        });
        updatedPriceIds[tier.id][currency] = newPrice.id;
      }
    }

    // Update database with new price IDs
    await prisma.pricingPlan.update({
      where: { id: planId },
      data: { stripePriceIds: updatedPriceIds as any },
    });
  }

  /**
   * Get pricing plan by Stripe price ID (supports multi-currency)
   */
  static async getPricingPlanByStripePriceId(stripePriceId: string): Promise<{
    plan: PricingPlanConfig;
    tier: PricingTier;
    currency: SupportedCurrency;
  } | null> {
    const plans = await this.getPricingPlans('saas');

    for (const plan of plans) {
      if (!plan.stripePriceIds) continue;

      for (const [tierId, currencyPriceIds] of Object.entries(plan.stripePriceIds)) {
        for (const [currency, priceId] of Object.entries(
          currencyPriceIds as Record<SupportedCurrency, string>
        )) {
          if (priceId === stripePriceId) {
            const tier = plan.tiers.find((t) => t.id === tierId);
            if (tier) {
              return { plan, tier, currency: currency as SupportedCurrency };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Create checkout session with locale-aware pricing
   */
  static async createCheckoutSession(params: {
    tierId: string;
    planId: string;
    customerEmail: string;
    locale?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const { tierId, planId, customerEmail, locale = 'en-US', successUrl, cancelUrl } = params;

    const plan = await this.getPricingPlanById(planId);
    if (!plan || !plan.stripeProductId) {
      throw new Error('Plan not found');
    }

    const tier = plan.tiers.find((t) => t.id === tierId);
    if (!tier) {
      throw new Error('Tier not found');
    }

    const currencyConfig = this.getCurrencyForLocale(locale);
    const currency = currencyConfig.code as SupportedCurrency;
    const priceInCurrency = tier.prices?.[currency] ?? this.convertPrice(tier.price, currency);
    const stripePriceId = plan.stripePriceIds?.[tierId]?.[currency];

    if (!stripePriceId) {
      throw new Error(`Price not found for currency ${currency}`);
    }

    return await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: customerEmail,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: locale.toLowerCase().replace('-', '_') as Stripe.Checkout.Session.Locale,
      currency: currency.toLowerCase(),
      metadata: {
        planId,
        tierId,
        locale,
        currency,
      },
    });
  }
}
