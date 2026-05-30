/**
 * lib/security/abuseDefense/policies.ts
 *
 * Central abuse-defense policies and helper utilities.
 */

import { createHash } from 'crypto';

import { AbusePolicy, AbuseRouteClass } from './types';

/**
 * Computes a secure SHA-256 hash of sensitive identifiers (API keys, tokens, session IDs, IPs)
 * to prevent raw secret leakage in the Redis/SharedStore keys.
 */
export function hashSensitive(value: string): string {
  if (!value) return '';
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Central configurations for each route/abuse class.
 */
export const AbusePolicies: Record<AbuseRouteClass, AbusePolicy> = {
  public_audit: {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // strict limit for expensive public audit
    failClosed: true,
    auditOnBlock: true,
    message: 'Too many public audit requests. Please try again later.',
  },
  widget_audit: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    failClosed: true,
    auditOnBlock: true,
    message: 'Too many widget quick-audit requests. Please wait.',
  },
  token_download: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // limit per valid token to prevent scraping
    failClosed: true,
    auditOnBlock: true,
    message: 'Proposal download limit exceeded. Please wait.',
  },
  token_status_update: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    failClosed: true,
    auditOnBlock: true,
  },
  authenticated_audit: {
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    failClosed: true,
    auditOnBlock: false,
  },
  batch_audit: {
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    failClosed: true,
    auditOnBlock: true,
  },
  proposal_generation: {
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    failClosed: true,
    auditOnBlock: false,
  },
  outreach: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    failClosed: true,
    auditOnBlock: false,
  },
  billing_checkout: {
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    failClosed: true,
    auditOnBlock: false,
  },
  stripe_webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 120, // generous, but guards against DDoS / signature flooding
    failClosed: true,
    auditOnBlock: true,
  },
  worker: {
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    failClosed: true,
    auditOnBlock: true,
  },
  cron: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    failClosed: true,
    auditOnBlock: true,
  },
  settings_admin: {
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    failClosed: true,
    auditOnBlock: false,
  },
  generic: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    failClosed: false,
    auditOnBlock: false,
  },
};

export function getAbusePolicy(routeClass: AbuseRouteClass): AbusePolicy {
  return AbusePolicies[routeClass] || AbusePolicies.generic;
}
