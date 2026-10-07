import { posthog } from './posthog';

export function trackEvent(event: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && posthog) {
    posthog.capture(event, properties);
  }
}

// Canonical Funnel Events Chain per Spec
export const events = {
  homepageView: () => trackEvent('homepage_view'),
  scanInputFocus: () => trackEvent('scan_input_focus'),
  scanStarted: (url: string, businessName?: string) =>
    trackEvent('scan_started', { url, businessName }),
  scanProgress: (token: string, percent: number, stage: string) =>
    trackEvent('scan_progress', { token, percent, stage }),
  scanCompleted: (token: string, score: number) =>
    trackEvent('scan_completed', { token, score }),
  emailGateShown: (token: string) => trackEvent('email_gate_shown', { token }),
  emailSubmitted: (token: string, email: string) =>
    trackEvent('email_submitted', { token, email }),
  reportViewed: (token: string, score: number) =>
    trackEvent('report_viewed', { token, score }),
  findingExpanded: (findingId: string) => trackEvent('finding_expanded', { findingId }),
  competitorTableViewed: (token: string) =>
    trackEvent('competitor_table_viewed', { token }),
  proposalViewed: (token: string) => trackEvent('proposal_viewed', { token }),
  proposalCtaClicked: (token: string, action: string, tierId?: string) =>
    trackEvent('proposal_cta_clicked', { token, action, tierId }),
  calendarBookCallClicked: (token: string, location: string) =>
    trackEvent('calendar_book_call_clicked', { token, location }),
  checkoutStarted: (tierId: string, amount: number) =>
    trackEvent('checkout_started', { tierId, amount }),
  checkoutCompleted: (tierId: string, transactionId: string) =>
    trackEvent('checkout_completed', { tierId, transactionId }),
  shareClicked: (platform: string, token: string) =>
    trackEvent('share_clicked', { platform, token }),
};
