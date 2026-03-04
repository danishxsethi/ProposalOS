import { posthog } from './posthog';

export function trackEvent(event: string, properties?: Record<string, any>) {
    if (typeof window !== 'undefined' && posthog) {
        posthog.capture(event, properties);
    }
}

// Pre-defined events
export const events = {
    scanInputFocus: () => trackEvent('scan_input_focus'),
    scanStarted: (url: string) => trackEvent('scan_started', { url }),
    scanCompleted: (token: string, score: number) => trackEvent('scan_completed', { token, score }),
    emailGateShown: (token: string) => trackEvent('email_gate_shown', { token }),
    emailSubmitted: (token: string) => trackEvent('email_submitted', { token }),
    reportViewed: (token: string, score: number) => trackEvent('report_viewed', { token, score }),
    findingExpanded: (findingId: string) => trackEvent('finding_expanded', { findingId }),
    proposalClicked: (token: string) => trackEvent('proposal_clicked', { token }),
    shareClicked: (platform: string, token: string) => trackEvent('share_clicked', { platform, token }),
    competitorTableViewed: () => trackEvent('competitor_table_viewed'),
};