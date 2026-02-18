/**
 * Waterfall Enrichment
 *
 * Queries enrichment providers in strict order (Apollo → Hunter → Proxycurl → Clearbit)
 * to find decision-maker contact info. Stops as soon as a verified email is obtained.
 * Skips providers that error or timeout. Records each enrichment attempt in
 * ProspectEnrichmentRun for auditability.
 *
 * Providers are pluggable (injectable functions) for testing.
 *
 * Requirements: 1.5, 1.8
 */

import { prisma } from '@/lib/prisma';
import type { EnrichmentResult } from './types';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Data returned by a single enrichment provider.
 */
export interface ProviderResult {
  email?: string;
  phone?: string;
  decisionMaker?: {
    name: string;
    title: string;
  };
}

/**
 * A pluggable enrichment provider function.
 * Takes a business name and website, returns contact info.
 */
export type EnrichmentProvider = (
  businessName: string,
  website: string
) => Promise<ProviderResult>;

/**
 * The ordered list of providers in the waterfall sequence.
 */
export const PROVIDER_ORDER = ['APOLLO', 'HUNTER', 'PROXYCURL', 'CLEARBIT'] as const;
export type ProviderName = (typeof PROVIDER_ORDER)[number];

// ============================================================================
// Default Provider Stubs
// ============================================================================

/**
 * Default Apollo provider stub.
 * In production, this would call the Apollo.io API.
 */
export const defaultApolloProvider: EnrichmentProvider = async (
  _businessName,
  _website
) => {
  return {};
};

/**
 * Default Hunter provider stub.
 * In production, this would call the Hunter.io API.
 */
export const defaultHunterProvider: EnrichmentProvider = async (
  _businessName,
  _website
) => {
  return {};
};

/**
 * Default Proxycurl provider stub.
 * In production, this would call the Proxycurl (LinkedIn) API.
 */
export const defaultProxycurlProvider: EnrichmentProvider = async (
  _businessName,
  _website
) => {
  return {};
};

/**
 * Default Clearbit provider stub.
 * In production, this would call the Clearbit API.
 */
export const defaultClearbitProvider: EnrichmentProvider = async (
  _businessName,
  _website
) => {
  return {};
};

// ============================================================================
// Configuration
// ============================================================================

/**
 * Injectable provider map for the waterfall enrichment.
 * Keys must match PROVIDER_ORDER entries.
 */
export type EnrichmentProviders = Partial<Record<ProviderName, EnrichmentProvider>>;

export interface WaterfallConfig {
  /** Timeout per provider in milliseconds. Default: 10000 (10s). */
  timeoutMs?: number;
  /** Cost in cents per provider call. Default: 1 cent per call. */
  costPerCallCents?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_COST_PER_CALL_CENTS = 1;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Wraps a provider call with a timeout. Rejects if the provider
 * doesn't respond within the given milliseconds.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Provider timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Returns true if the provider result contains a verified email.
 */
export function hasVerifiedEmail(result: ProviderResult): boolean {
  return typeof result.email === 'string' && result.email.length > 0;
}

/**
 * Returns the default provider map using the stub implementations.
 */
function getDefaultProviders(): Record<ProviderName, EnrichmentProvider> {
  return {
    APOLLO: defaultApolloProvider,
    HUNTER: defaultHunterProvider,
    PROXYCURL: defaultProxycurlProvider,
    CLEARBIT: defaultClearbitProvider,
  };
}

// ============================================================================
// Core Enrichment Function
// ============================================================================

/**
 * Enrich a prospect by querying providers in waterfall order.
 *
 * 1. Fetches the prospect from the database
 * 2. Queries providers in strict order: Apollo → Hunter → Proxycurl → Clearbit
 * 3. Stops as soon as a verified email is found
 * 4. Skips providers that error or timeout (configurable timeout, default 10s)
 * 5. Updates the ProspectLead with the enrichment result
 * 6. Records each enrichment attempt in ProspectEnrichmentRun
 *
 * Requirements: 1.5, 1.8
 */
export async function enrichProspect(
  leadId: string,
  providers?: EnrichmentProviders,
  config?: WaterfallConfig
): Promise<EnrichmentResult> {
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const costPerCall = config?.costPerCallCents ?? DEFAULT_COST_PER_CALL_CENTS;
  const defaultProviders = getDefaultProviders();
  const resolvedProviders: Record<ProviderName, EnrichmentProvider> = {
    ...defaultProviders,
    ...providers,
  };

  // 1. Fetch the prospect from the database
  const lead = await prisma.prospectLead.findUniqueOrThrow({
    where: { id: leadId },
  });

  const businessName = lead.businessName;
  const website = lead.website ?? '';

  let totalCostCents = 0;
  let winningProvider: ProviderName | null = null;
  let winningResult: ProviderResult | null = null;

  // 2. Query providers in strict waterfall order
  for (const providerName of PROVIDER_ORDER) {
    const providerFn = resolvedProviders[providerName];

    // Create enrichment run record (PENDING)
    const enrichmentRun = await prisma.prospectEnrichmentRun.create({
      data: {
        tenantId: lead.tenantId,
        leadId: lead.id,
        provider: providerName,
        status: 'PENDING',
        requestPayload: { businessName, website },
        costCents: costPerCall,
        startedAt: new Date(),
      },
    });

    totalCostCents += costPerCall;

    try {
      // 4. Apply timeout to provider call
      const result = await withTimeout(
        providerFn(businessName, website),
        timeoutMs
      );

      // Record success
      await prisma.prospectEnrichmentRun.update({
        where: { id: enrichmentRun.id },
        data: {
          status: 'SUCCESS',
          responsePayload: result as Record<string, unknown>,
          completedAt: new Date(),
        },
      });

      // 3. Stop as soon as a verified email is found
      if (hasVerifiedEmail(result)) {
        winningProvider = providerName;
        winningResult = result;
        break;
      }
    } catch (error) {
      // 4. Skip providers that error or timeout — continue with next
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await prisma.prospectEnrichmentRun.update({
        where: { id: enrichmentRun.id },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      });

      // Continue to next provider
    }
  }

  // 5. Build the enrichment result
  const enrichmentResult: EnrichmentResult = {
    leadId,
    provider: winningProvider ?? 'NONE',
    costCents: totalCostCents,
  };

  if (winningResult) {
    enrichmentResult.email = winningResult.email;
    enrichmentResult.phone = winningResult.phone;

    if (winningResult.decisionMaker && winningResult.email) {
      enrichmentResult.decisionMaker = {
        name: winningResult.decisionMaker.name,
        title: winningResult.decisionMaker.title,
        email: winningResult.email,
      };
    }
  }

  // 6. Update the ProspectLead with enrichment results
  const updateData: Record<string, unknown> = {
    enrichmentState: {
      completedAt: new Date().toISOString(),
      provider: winningProvider ?? 'NONE',
      totalCostCents,
    },
    estimatedCostCents: { increment: totalCostCents },
  };

  if (winningResult?.email) {
    updateData.decisionMakerEmail = winningResult.email;
    updateData.decisionMakerEmailStatus = 'verified';
  }

  if (winningResult?.decisionMaker) {
    updateData.decisionMakerName = winningResult.decisionMaker.name;
    updateData.decisionMakerTitle = winningResult.decisionMaker.title;
  }

  if (winningResult?.phone) {
    updateData.phone = winningResult.phone;
  }

  await prisma.prospectLead.update({
    where: { id: leadId },
    data: updateData,
  });

  return enrichmentResult;
}
