/**
 * Slack notifications for human escalation
 */
import { logger } from '@/lib/logger';

interface SlackNotificationConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface SlackMessage {
  text?: string;
  attachments?: SlackAttachment[];
  blocks?: any[];
}

export interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: SlackField[];
  mrkdwn_in?: string[];
}

export interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

class SlackNotifier {
  private config: SlackNotificationConfig;

  constructor(config: SlackNotificationConfig) {
    this.config = config;
  }

  async sendNotification(
    message: string,
    proposalId: string,
    tenantId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const slackMessage: SlackMessage = {
        text: `🚨 *AI Chat Escalation Alert*`,
        attachments: [
          {
            color: 'danger',
            fields: [
              {
                title: 'Proposal ID',
                value: `<${process.env.NEXT_PUBLIC_BASE_URL}/proposal/${proposalId}|${proposalId}>`,
                short: true,
              },
              {
                title: 'Tenant ID',
                value: tenantId,
                short: true,
              },
              {
                title: 'Session ID',
                value: sessionId || 'N/A',
                short: true,
              },
              {
                title: 'Reason',
                value: message,
                short: false,
              },
            ],
            mrkdwn_in: ['fields'],
          },
        ],
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Slack notification failed');
      return false;
    }
  }

  async sendProspectAlert(alertType: string, prospectData: any): Promise<boolean> {
    try {
      const slackMessage: SlackMessage = {
        text: `⚠️ *${alertType.toUpperCase()} ALERT*`,
        attachments: [
          {
            color: 'warning',
            fields: [
              {
                title: 'Business Name',
                value: prospectData.businessName || 'N/A',
                short: true,
              },
              {
                title: 'Proposal ID',
                value: prospectData.proposalId || 'N/A',
                short: true,
              },
              {
                title: 'Pain Score',
                value: `${prospectData.painScore || 0}/100`,
                short: true,
              },
              {
                title: 'Engagement Score',
                value: `${prospectData.engagementScore || 0}`,
                short: true,
              },
              {
                title: 'Status',
                value: prospectData.status || 'N/A',
                short: true,
              },
            ],
            mrkdwn_in: ['fields'],
          },
        ],
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error }, 'Slack prospect alert failed');
      return false;
    }
  }
}

// Global slack notifier instance
let slackNotifier: SlackNotifier | null = null;

export function initSlackNotifier(config: SlackNotificationConfig): void {
  if (config.webhookUrl) {
    slackNotifier = new SlackNotifier(config);
  }
}

export async function sendSlackNotification(
  message: string,
  proposalId: string,
  tenantId: string,
  sessionId?: string
): Promise<boolean> {
  if (!slackNotifier) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      slackNotifier = new SlackNotifier({ webhookUrl });
    } else {
      logger.warn('Slack notifier not initialized - no webhook URL provided');
      return false;
    }
  }

  return slackNotifier.sendNotification(message, proposalId, tenantId, sessionId);
}

export async function sendSlackProspectAlert(
  alertType: string,
  prospectData: any
): Promise<boolean> {
  if (!slackNotifier) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      slackNotifier = new SlackNotifier({ webhookUrl });
    } else {
      logger.warn('Slack notifier not initialized - no webhook URL provided');
      return false;
    }
  }

  return slackNotifier.sendProspectAlert(alertType, prospectData);
}

/**
 * Alert types for pipeline monitoring
 */
export interface AlertOptions {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  metadata?: Record<string, unknown>;
}

/**
 * Send alert to Slack for pipeline events
 */
export async function sendAlert(options: AlertOptions): Promise<boolean> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return false;
    }

    const severityColors: Record<string, string> = {
      critical: 'danger',
      high: 'danger',
      medium: 'warning',
      low: '#439FE0',
      info: 'good',
    };

    const severityEmojis: Record<string, string> = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️',
      info: '📢',
    };

    const slackMessage: SlackMessage = {
      text: `${severityEmojis[options.severity] || '📢'} *${options.title}*`,
      attachments: [
        {
          color: severityColors[options.severity] || 'good',
          fields: [
            {
              title: 'Tenant ID',
              value: options.tenantId,
              short: true,
            },
            {
              title: 'Alert Type',
              value: options.type,
              short: true,
            },
            {
              title: 'Message',
              value: options.message,
              short: false,
            },
            ...(options.metadata
              ? Object.entries(options.metadata).map(([key, value]) => ({
                  title: key,
                  value: String(value),
                  short: true,
                }))
              : []),
          ],
          mrkdwn_in: ['fields'],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    return response.ok;
  } catch (error) {
    logger.error({ error }, 'Slack alert failed');
    return false;
  }
}
