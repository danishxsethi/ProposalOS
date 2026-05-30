/**
 * lib/security/abuseDefense/types.ts
 *
 * Types and interfaces for central abuse defense policies.
 */

export type AbuseRouteClass =
  | 'public_audit'
  | 'widget_audit'
  | 'token_download'
  | 'token_status_update'
  | 'authenticated_audit'
  | 'batch_audit'
  | 'proposal_generation'
  | 'outreach'
  | 'billing_checkout'
  | 'stripe_webhook'
  | 'worker'
  | 'cron'
  | 'settings_admin'
  | 'generic';

export interface AbusePolicy {
  windowMs: number;
  max: number;
  failClosed: boolean;
  auditOnBlock: boolean;
  message?: string;
}
