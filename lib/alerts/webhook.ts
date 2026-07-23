/**
 * FIX-08: Slack / Discord webhook alert system.
 * Wire into CostTracker, PrivacyMonitor, and audit runner for real-time alerts.
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertPayload {
    title: string;
    message: string;
    severity: AlertSeverity;
    fields?: Record<string, string | number>;
    pipeline?: string;
    auditId?: string;
    tenantId?: string;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
    info: '🔵',
    warning: '🟡',
    error: '🔴',
    critical: '🚨',
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
    info: '#36a64f',
    warning: '#ff9500',
    error: '#e01e5a',
    critical: '#8B0000',
};

/**
 * Send an alert to a Slack-compatible webhook.
 * Set SLACK_WEBHOOK_URL in environment to enable.
 * Safe to call even if the env var is not set — will log to console only.
 */
export async function sendAlert(payload: AlertPayload): Promise<void> {
    const emoji = SEVERITY_EMOJI[payload.severity];
    const color = SEVERITY_COLOR[payload.severity];

    // Build Slack Block Kit message
    const fields = payload.fields
        ? Object.entries(payload.fields).map(([key, value]) => ({
            type: 'mrkdwn',
            text: `*${key}:*\n${value}`,
        }))
        : [];

    if (payload.auditId) {
        fields.push({ type: 'mrkdwn', text: `*Audit ID:*\n${payload.auditId}` });
    }
    if (payload.tenantId) {
        fields.push({ type: 'mrkdwn', text: `*Tenant ID:*\n${payload.tenantId}` });
    }
    if (payload.pipeline) {
        fields.push({ type: 'mrkdwn', text: `*Pipeline:*\n${payload.pipeline}` });
    }

    const slackBody = {
        attachments: [
            {
                color,
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: `${emoji} ${payload.title}`,
                            emoji: true,
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: payload.message,
                        },
                    },
                    ...(fields.length > 0
                        ? [
                            {
                                type: 'section',
                                fields,
                            },
                        ]
                        : []),
                    {
                        type: 'context',
                        elements: [
                            {
                                type: 'mrkdwn',
                                text: `ProposalOS · ${new Date().toISOString()}`,
                            },
                        ],
                    },
                ],
            },
        ],
    };

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
        // No webhook configured — log to console as fallback
        console.warn(
            `[Alert][${payload.severity.toUpperCase()}] ${payload.title}: ${payload.message}`,
            payload.fields
        );
        return;
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackBody),
        });

        if (!res.ok) {
            console.error(`[Alert] Slack webhook returned ${res.status}: ${await res.text()}`);
        }
    } catch (err) {
        // Never let alert failures crash the application
        console.error('[Alert] Failed to send Slack webhook:', err);
    }
}

/**
 * Convenience helpers for common alert patterns
 */
export const alerts = {
    auditFailed: (auditId: string, tenantId: string, error: string) =>
        sendAlert({
            title: 'Audit Failed',
            message: `An audit terminated with an unrecoverable error.\n\`${error}\``,
            severity: 'error',
            pipeline: 'Autonomous Audit Engine',
            auditId,
            tenantId,
        }),

    costCapHit: (auditId: string, tenantId: string, cents: number, level: 'soft' | 'hard') =>
        sendAlert({
            title: level === 'hard' ? '🛑 Hard Cost Cap Exceeded' : 'Soft Cost Cap Reached',
            message:
                level === 'hard'
                    ? `Audit terminated: cost exceeded $2.00 hard cap at $${(cents / 100).toFixed(2)}.`
                    : `Audit cost exceeded $1.00 soft cap. Currently at $${(cents / 100).toFixed(2)}.`,
            severity: level === 'hard' ? 'critical' : 'warning',
            pipeline: 'LLM Layer & Cost Control',
            auditId,
            tenantId,
            fields: { 'Cost (cents)': cents },
        }),

    privacyLeak: (description: string, severity: AlertSeverity) =>
        sendAlert({
            title: 'Privacy Concern Detected',
            message: description,
            severity,
            pipeline: 'Cross-Tenant Intelligence',
        }),
};
