/**
 * Fintech Partner Integrations
 *
 * Tracks referrals to SMB lending platforms (Stripe Capital, Clearco, etc.)
 * with full conversion attribution. Revenue is earned when a referred client
 * successfully obtains a loan.
 *
 * Requirements: 19.3, 19.6
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FintechPartner = 'stripe_capital' | 'clearco' | 'kabbage' | 'fundbox';

export type ReferralStatus = 'pending' | 'applied' | 'approved' | 'converted' | 'rejected';

export interface DateRange {
  start: Date;
  end: Date;
}

/** A single referral event sent to a fintech partner. */
export interface ReferralEvent {
  id: string;
  clientId: string;
  partner: FintechPartner;
  referralCode: string;
  status: ReferralStatus;
  createdAt: Date;
  convertedAt?: Date;
  /** Loan amount in cents when status is 'converted'. */
  loanAmount?: number;
}

/** Aggregated stats for a partner over an optional date range. */
export interface ReferralStats {
  partner: FintechPartner;
  totalReferrals: number;
  conversions: number;
  conversionRate: number; // 0–1
  totalLoanVolume: number; // in cents
  averageLoanAmount: number; // in cents
}

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

const referralStore = new Map<string, ReferralEvent>();
let counter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Date.now().toString(36)}`;
}

function eventsInRange(events: ReferralEvent[], dateRange?: DateRange): ReferralEvent[] {
  if (!dateRange) return events;
  return events.filter(
    (e) => e.createdAt >= dateRange.start && e.createdAt <= dateRange.end,
  );
}

// ─── Referral Tracking ────────────────────────────────────────────────────────

/**
 * Record a new referral event for a client being sent to a fintech partner.
 *
 * @param clientId     The platform client being referred
 * @param partner      The fintech partner receiving the referral
 * @param referralCode Unique referral code for attribution tracking
 * @returns The created ReferralEvent
 */
export function trackReferral(
  clientId: string,
  partner: FintechPartner,
  referralCode: string,
): ReferralEvent {
  if (!clientId) throw new Error('clientId is required');
  if (!partner) throw new Error('partner is required');
  if (!referralCode) throw new Error('referralCode is required');

  const event: ReferralEvent = {
    id: generateId('ref'),
    clientId,
    partner,
    referralCode,
    status: 'pending',
    createdAt: new Date(),
  };

  referralStore.set(event.id, event);
  return event;
}

/**
 * Mark a referral as converted with the resulting loan amount.
 * Updates the referral status to 'converted' and records the loan amount
 * for revenue attribution.
 *
 * @param referralId  The ID of the referral to mark as converted
 * @param loanAmount  The approved loan amount in cents
 * @returns The updated ReferralEvent
 */
export function recordConversion(referralId: string, loanAmount: number): ReferralEvent {
  if (!referralId) throw new Error('referralId is required');
  if (loanAmount < 0) throw new Error('loanAmount must be non-negative');

  const event = referralStore.get(referralId);
  if (!event) throw new Error(`Referral not found: ${referralId}`);
  if (event.status === 'converted') throw new Error(`Referral ${referralId} is already converted`);

  const updated: ReferralEvent = {
    ...event,
    status: 'converted',
    loanAmount,
    convertedAt: new Date(),
  };

  referralStore.set(referralId, updated);
  return updated;
}

/**
 * Update the status of a referral (e.g. from 'pending' to 'applied').
 *
 * @param referralId The ID of the referral to update
 * @param status     The new status
 * @returns The updated ReferralEvent
 */
export function updateReferralStatus(referralId: string, status: ReferralStatus): ReferralEvent {
  if (!referralId) throw new Error('referralId is required');

  const event = referralStore.get(referralId);
  if (!event) throw new Error(`Referral not found: ${referralId}`);

  const updated: ReferralEvent = { ...event, status };
  referralStore.set(referralId, updated);
  return updated;
}

// ─── Stats & Reporting ────────────────────────────────────────────────────────

/**
 * Return aggregated referral statistics for a partner, optionally filtered
 * to a specific date range.
 *
 * @param partner    The fintech partner to report on
 * @param dateRange  Optional date range filter (uses createdAt for scoping)
 * @returns ReferralStats with conversion rate and total loan volume
 */
export function getReferralStats(partner: FintechPartner, dateRange?: DateRange): ReferralStats {
  if (!partner) throw new Error('partner is required');

  const allEvents = Array.from(referralStore.values()).filter((e) => e.partner === partner);
  const events = eventsInRange(allEvents, dateRange);

  const conversions = events.filter((e) => e.status === 'converted');
  const totalLoanVolume = conversions.reduce((sum, e) => sum + (e.loanAmount ?? 0), 0);

  return {
    partner,
    totalReferrals: events.length,
    conversions: conversions.length,
    conversionRate: events.length > 0 ? conversions.length / events.length : 0,
    totalLoanVolume,
    averageLoanAmount: conversions.length > 0 ? totalLoanVolume / conversions.length : 0,
  };
}

/**
 * Retrieve a referral event by ID.
 */
export function getReferral(referralId: string): ReferralEvent | undefined {
  return referralStore.get(referralId);
}

/**
 * List all referrals for a specific client.
 */
export function getClientReferrals(clientId: string): ReferralEvent[] {
  return Array.from(referralStore.values()).filter((e) => e.clientId === clientId);
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Clear all stored data (intended for test isolation only).
 */
export function _clearStore(): void {
  referralStore.clear();
  counter = 0;
}
