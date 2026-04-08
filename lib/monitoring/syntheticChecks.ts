/**
 * lib/monitoring/syntheticChecks.ts
 *
 * Phase M — Synthetic Monitoring Configuration
 *
 * Configures external synthetic uptime checks for critical endpoints.
 * Supports Google Cloud Monitoring, UptimeRobot, and Checkly.
 */

import { logger } from '@/lib/logger';

/**
 * Critical endpoint definitions for synthetic monitoring
 */
export interface SyntheticCheck {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  expectedStatus: number;
  timeoutMs: number;
  checkIntervalSeconds: number;
  regions: string[];
  alertOnFailure: boolean;
}

/**
 * Critical endpoints to monitor
 */
export const CRITICAL_ENDPOINTS: SyntheticCheck[] = [
  {
    name: 'API Health Check',
    url: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.proposal-os.com'}/api/health`,
    method: 'GET',
    expectedStatus: 200,
    timeoutMs: 5000,
    checkIntervalSeconds: 60,
    regions: ['us-central1', 'us-east1', 'eu-west1'],
    alertOnFailure: true,
  },
  {
    name: 'Audit Trigger Endpoint',
    url: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.proposal-os.com'}/api/audit`,
    method: 'POST',
    expectedStatus: 200,
    timeoutMs: 30000,
    checkIntervalSeconds: 300,
    regions: ['us-central1'],
    alertOnFailure: true,
  },
  {
    name: 'Proposal Generation Endpoint',
    url: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.proposal-os.com'}/api/audit/[id]/propose`,
    method: 'POST',
    expectedStatus: 200,
    timeoutMs: 60000,
    checkIntervalSeconds: 300,
    regions: ['us-central1'],
    alertOnFailure: true,
  },
  {
    name: 'Widget Embed Endpoint',
    url: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.proposal-os.com'}/widget.js`,
    method: 'GET',
    expectedStatus: 200,
    timeoutMs: 5000,
    checkIntervalSeconds: 60,
    regions: ['us-central1', 'us-east1', 'eu-west1'],
    alertOnFailure: true,
  },
  {
    name: 'Cold Outreach Webhook',
    url: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.proposal-os.com'}/api/cron/pipeline-outreach`,
    method: 'POST',
    expectedStatus: 200,
    timeoutMs: 10000,
    checkIntervalSeconds: 300,
    regions: ['us-central1'],
    alertOnFailure: true,
  },
];

/**
 * Google Cloud Monitoring Uptime Check Configuration
 *
 * To deploy:
 * 1. Install gcloud CLI: `brew install --cask google-cloud-sdk`
 * 2. Authenticate: `gcloud auth login`
 * 3. Set project: `gcloud config set project YOUR_PROJECT_ID`
 * 4. Run: `gcloud monitoring uptime check create --config-from-file=gcp-uptime-checks.yaml`
 */
export function generateGCPConfig(): string {
  const checks = CRITICAL_ENDPOINTS.map((endpoint) => ({
    displayName: endpoint.name,
    protocol: endpoint.method === 'GET' ? 'HTTP' : 'HTTPS',
    resourceType: 'UPTIME_CHECK_URL',
    resourceLabels: {
      host: new URL(endpoint.url).hostname,
      path: new URL(endpoint.url).pathname,
      port: '443',
    },
    period: `${endpoint.checkIntervalSeconds}s`,
    timeout: `${endpoint.timeoutMs}ms`,
    contentMatchers: [
      {
        content: endpoint.expectedStatus.toString(),
        matcher: 'STATUS_CODE',
      },
    ],
    httpCheck: {
      requestMethod: endpoint.method,
      headers: {
        'User-Agent': 'ProposalOS-Synthetic-Monitor/1.0',
      },
    },
    isInternal: false,
  }));

  return JSON.stringify({ checks }, null, 2);
}

/**
 * UptimeRobot Configuration
 *
 * To deploy:
 * 1. Get API key from https://uptimerobot.com/dashboard
 * 2. Use the API to create monitors
 */
export async function createUptimeRobotMonitors(apiKey: string): Promise<void> {
  const baseUrl = 'https://api.uptimerobot.com/v2/newMonitor';

  for (const endpoint of CRITICAL_ENDPOINTS) {
    const params = new URLSearchParams({
      api_key: apiKey,
      format: 'json',
      type: '1', // HTTP
      url: endpoint.url,
      friendly_name: endpoint.name,
      interval: endpoint.checkIntervalSeconds.toString(),
      timeout: (endpoint.timeoutMs / 1000).toString(),
    });

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      const result = await response.json();
      if (result.stat === 'ok') {
        logger.info(`[SyntheticMonitoring] Created UptimeRobot monitor: ${endpoint.name}`);
      } else {
        logger.error(`[SyntheticMonitoring] Failed to create monitor: ${endpoint.name}`, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[SyntheticMonitoring] Error creating monitor: ${endpoint.name}: ${errorMessage}`);
    }
  }
}

/**
 * Checkly Configuration
 *
 * To deploy:
 * 1. Install Checkly CLI: `npm install -g checkly`
 * 2. Authenticate: `checkly login`
 * 3. Deploy: `checkly deploy`
 */
export function generateChecklyConfig(): string {
  const checks = CRITICAL_ENDPOINTS.map((endpoint) => `
import { CheckBuilder } from 'checkly/constructs';

new CheckBuilder('${endpoint.name.toLowerCase().replace(/\s+/g, '-')}', {
  name: '${endpoint.name}',
  type: 'API',
  frequency: ${endpoint.checkIntervalSeconds},
  locations: ${JSON.stringify(endpoint.regions)},
  tags: ['critical', 'phase-m'],
  apiChecks: {
    url: '${endpoint.url}',
    method: '${endpoint.method}',
    assertionRetries: 2,
    maxResponseTime: ${endpoint.timeoutMs},
    assertions: [
      {
        source: 'STATUS_CODE',
        property: '',
        comparison: 'EQUALS',
        target: '${endpoint.expectedStatus}',
      },
    ],
  },
  alertChannels: [
    // Configure email, Slack, PagerDuty, etc.
  ],
});
`).join('\n');

  return checks;
}

/**
 * Health check function for internal synthetic monitoring
 * Runs every minute to verify all critical endpoints
 */
export async function runSyntheticChecks(): Promise<SyntheticCheckResult[]> {
  const results: SyntheticCheckResult[] = [];

  for (const endpoint of CRITICAL_ENDPOINTS) {
    const startTime = Date.now();
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          'User-Agent': 'ProposalOS-Synthetic-Monitor/1.0',
        },
      });

      const latency = Date.now() - startTime;
      const success = response.status === endpoint.expectedStatus;

      results.push({
        endpoint: endpoint.name,
        success,
        statusCode: response.status,
        latency,
        timestamp: new Date().toISOString(),
        error: success ? null : `Expected ${endpoint.expectedStatus}, got ${response.status}`,
      });
    } catch (error) {
      results.push({
        endpoint: endpoint.name,
        success: false,
        statusCode: 0,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

interface SyntheticCheckResult {
  endpoint: string;
  success: boolean;
  statusCode: number;
  latency: number;
  timestamp: string;
  error: string | null;
}

/**
 * Export configurations for different monitoring providers
 */
export function exportConfigurations(): void {
  // GCP Config
  const gcpConfig = generateGCPConfig();
  logger.info('[SyntheticMonitoring] GCP Config generated');

  // Checkly Config
  const checklyConfig = generateChecklyConfig();
  logger.info('[SyntheticMonitoring] Checkly Config generated');
}
