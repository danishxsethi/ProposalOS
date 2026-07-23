/**
 * Unit Tests: Multi-Platform Integration Layer
 *
 * Tests platform detection accuracy, backup creation before deployment,
 * and rollback on failure.
 *
 * Requirements: 6.2, 6.6, 6.7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MultiPlatformIntegration,
  type PlatformAdapter,
} from '../multiPlatformIntegration';
import type {
  SupportedPlatform,
  PlatformCredentials,
  DeploymentChange,
  BackupResult,
  RollbackResult,
} from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCredentials(
  platform: SupportedPlatform,
  siteUrl: string
): PlatformCredentials {
  return { platform, siteUrl, apiKey: 'test-key', accessToken: 'test-token' };
}

function makeChanges(count = 1): DeploymentChange[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'seo-fix' as const,
    description: `Change ${i + 1}`,
  }));
}

/**
 * Injects a controllable adapter into the integration instance.
 */
function injectAdapter(
  integration: MultiPlatformIntegration,
  adapter: PlatformAdapter
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (integration as any).getAdapter = () => adapter;
}

function makeSuccessAdapter(): PlatformAdapter & { deployCalled: boolean; backupCalled: boolean } {
  const adapter = {
    deployCalled: false,
    backupCalled: false,
    async validateCredentials() { return true; },
    async createBackup(creds: PlatformCredentials): Promise<BackupResult> {
      adapter.backupCalled = true;
      return {
        backupId: `backup_${Date.now()}`,
        createdAt: new Date(),
        platform: creds.platform,
        siteUrl: creds.siteUrl,
      };
    },
    async deploy() {
      adapter.deployCalled = true;
    },
    async rollback(_creds: PlatformCredentials, backupId: string): Promise<RollbackResult> {
      return { success: true, backupId, rolledBackAt: new Date() };
    },
  };
  return adapter;
}

function makeFailingAdapter(): PlatformAdapter & { rollbackCalled: boolean; backupCalled: boolean } {
  const adapter = {
    rollbackCalled: false,
    backupCalled: false,
    async validateCredentials() { return true; },
    async createBackup(creds: PlatformCredentials): Promise<BackupResult> {
      adapter.backupCalled = true;
      return {
        backupId: `backup_fail_${Date.now()}`,
        createdAt: new Date(),
        platform: creds.platform,
        siteUrl: creds.siteUrl,
      };
    },
    async deploy(): Promise<void> {
      throw new Error('Deployment failed');
    },
    async rollback(_creds: PlatformCredentials, backupId: string): Promise<RollbackResult> {
      adapter.rollbackCalled = true;
      return { success: true, backupId, rolledBackAt: new Date() };
    },
  };
  return adapter;
}

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.detectPlatform', () => {
  let integration: MultiPlatformIntegration;

  beforeEach(() => {
    integration = new MultiPlatformIntegration();
  });

  it('detects WordPress from wordpress.com URL', async () => {
    const result = await integration.detectPlatform('https://myblog.wordpress.com');
    expect(result.platform).toBe('wordpress');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('detects WordPress from wp-content path', async () => {
    const result = await integration.detectPlatform('https://example.com/wp-content/themes/');
    expect(result.platform).toBe('wordpress');
  });

  it('detects Shopify from myshopify.com URL', async () => {
    const result = await integration.detectPlatform('https://mystore.myshopify.com');
    expect(result.platform).toBe('shopify');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('detects Shopify from shopify.com URL', async () => {
    const result = await integration.detectPlatform('https://shopify.com/store');
    expect(result.platform).toBe('shopify');
  });

  it('detects Wix from wix.com URL', async () => {
    const result = await integration.detectPlatform('https://mybiz.wix.com');
    expect(result.platform).toBe('wix');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('detects Wix from wixsite.com URL', async () => {
    const result = await integration.detectPlatform('https://user.wixsite.com/mysite');
    expect(result.platform).toBe('wix');
  });

  it('detects Squarespace from squarespace.com URL', async () => {
    const result = await integration.detectPlatform('https://mybiz.squarespace.com');
    expect(result.platform).toBe('squarespace');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('falls back to custom for unknown URLs', async () => {
    const result = await integration.detectPlatform('https://totally-custom-site.io');
    expect(result.platform).toBe('custom');
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('returns a confidence score between 0 and 1 for all platforms', async () => {
    const urls = [
      'https://myblog.wordpress.com',
      'https://mystore.myshopify.com',
      'https://mybiz.wix.com',
      'https://mybiz.squarespace.com',
      'https://unknown.io',
    ];
    for (const url of urls) {
      const result = await integration.detectPlatform(url);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Credential Validation
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.validateCredentials', () => {
  let integration: MultiPlatformIntegration;

  beforeEach(() => {
    integration = new MultiPlatformIntegration();
  });

  it('returns true for valid WordPress credentials', async () => {
    const creds = makeCredentials('wordpress', 'https://myblog.wordpress.com');
    const valid = await integration.validateCredentials(creds);
    expect(valid).toBe(true);
  });

  it('returns true for valid Shopify credentials', async () => {
    const creds = makeCredentials('shopify', 'https://mystore.myshopify.com');
    const valid = await integration.validateCredentials(creds);
    expect(valid).toBe(true);
  });

  it('returns false for Shopify credentials missing accessToken', async () => {
    const creds: PlatformCredentials = {
      platform: 'shopify',
      siteUrl: 'https://mystore.myshopify.com',
      // no apiKey or accessToken
    };
    const valid = await integration.validateCredentials(creds);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backup Creation Before Deployment (Requirement 6.6)
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.deploy — backup before changes', () => {
  it('creates a backup before applying changes on a successful deployment', async () => {
    const integration = new MultiPlatformIntegration();
    const adapter = makeSuccessAdapter();
    injectAdapter(integration, adapter);

    const creds = makeCredentials('wordpress', 'https://example.com');
    const result = await integration.deploy(creds, makeChanges(2), 'client-1');

    expect(adapter.backupCalled).toBe(true);
    expect(adapter.deployCalled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.backupId).toBeTruthy();
  });

  it('records backupId in the deployment log', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeSuccessAdapter());

    const creds = makeCredentials('shopify', 'https://mystore.myshopify.com');
    const result = await integration.deploy(creds, makeChanges(), 'client-2');

    const history = await integration.getDeploymentHistory('client-2');
    expect(history.length).toBe(1);
    expect(history[0].backupId).toBe(result.backupId);
  });

  it('records the correct platform and clientId in the log', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeSuccessAdapter());

    const creds = makeCredentials('wix', 'https://mybiz.wix.com');
    await integration.deploy(creds, makeChanges(), 'client-3');

    const history = await integration.getDeploymentHistory('client-3');
    expect(history[0].platform).toBe('wix');
    expect(history[0].clientId).toBe('client-3');
    expect(history[0].status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Rollback on Failure (Requirement 6.7)
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.deploy — rollback on failure', () => {
  it('automatically rolls back when deployment fails', async () => {
    const integration = new MultiPlatformIntegration();
    const adapter = makeFailingAdapter();
    injectAdapter(integration, adapter);

    const creds = makeCredentials('wordpress', 'https://example.com');
    const result = await integration.deploy(creds, makeChanges(), 'client-4');

    expect(result.success).toBe(false);
    expect(adapter.backupCalled).toBe(true);
    expect(adapter.rollbackCalled).toBe(true);
    expect(result.rolledBack).toBe(true);
  });

  it('sets deployment status to failed in the log', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeFailingAdapter());

    const creds = makeCredentials('shopify', 'https://mystore.myshopify.com');
    await integration.deploy(creds, makeChanges(), 'client-5');

    const history = await integration.getDeploymentHistory('client-5');
    expect(history.length).toBe(1);
    expect(history[0].status).toBe('failed');
  });

  it('records backupId in the failed deployment log', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeFailingAdapter());

    const creds = makeCredentials('squarespace', 'https://mybiz.squarespace.com');
    const result = await integration.deploy(creds, makeChanges(), 'client-6');

    const history = await integration.getDeploymentHistory('client-6');
    expect(history[0].backupId).toBe(result.backupId);
    expect(result.backupId).toBeTruthy();
  });

  it('includes an errorMessage in the result when deployment fails', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeFailingAdapter());

    const creds = makeCredentials('wix', 'https://mybiz.wix.com');
    const result = await integration.deploy(creds, makeChanges(), 'client-7');

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeTruthy();
    expect(typeof result.errorMessage).toBe('string');
  });

  it('sets changesApplied to 0 on failure', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeFailingAdapter());

    const creds = makeCredentials('custom', 'https://custom-site.io');
    const result = await integration.deploy(creds, makeChanges(3), 'client-8');

    expect(result.changesApplied).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deployment History
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.getDeploymentHistory', () => {
  it('returns empty array for a client with no deployments', async () => {
    const integration = new MultiPlatformIntegration();
    const history = await integration.getDeploymentHistory('no-deployments');
    expect(history).toEqual([]);
  });

  it('returns all deployments for a client ordered by deployedAt descending', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeSuccessAdapter());

    const creds = makeCredentials('wordpress', 'https://example.com');
    await integration.deploy(creds, makeChanges(), 'client-history');
    await integration.deploy(creds, makeChanges(), 'client-history');
    await integration.deploy(creds, makeChanges(), 'client-history');

    const history = await integration.getDeploymentHistory('client-history');
    expect(history.length).toBe(3);

    // Verify descending order
    for (let i = 0; i < history.length - 1; i++) {
      expect(history[i].deployedAt.getTime()).toBeGreaterThanOrEqual(
        history[i + 1].deployedAt.getTime()
      );
    }
  });

  it('isolates deployment history per clientId', async () => {
    const integration = new MultiPlatformIntegration();
    injectAdapter(integration, makeSuccessAdapter());

    const creds = makeCredentials('shopify', 'https://mystore.myshopify.com');
    await integration.deploy(creds, makeChanges(), 'client-A');
    await integration.deploy(creds, makeChanges(), 'client-A');
    await integration.deploy(creds, makeChanges(), 'client-B');

    const historyA = await integration.getDeploymentHistory('client-A');
    const historyB = await integration.getDeploymentHistory('client-B');

    expect(historyA.length).toBe(2);
    expect(historyB.length).toBe(1);
    expect(historyA.every((l) => l.clientId === 'client-A')).toBe(true);
    expect(historyB.every((l) => l.clientId === 'client-B')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rollback (direct)
// ---------------------------------------------------------------------------

describe('MultiPlatformIntegration.rollback', () => {
  it('delegates rollback to the platform adapter', async () => {
    const integration = new MultiPlatformIntegration();
    const creds = makeCredentials('wordpress', 'https://example.com');

    const result = await integration.rollback(creds, 'backup_123');
    expect(result.success).toBe(true);
    expect(result.backupId).toBe('backup_123');
  });
});
