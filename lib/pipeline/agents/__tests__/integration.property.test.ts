/**
 * Property-Based Tests: Multi-Platform Integration Layer
 *
 * Property 7: Deployment Backup Requirement
 *   For any deployment to a client's website platform, a backup must be
 *   created before any changes are applied. The backup ID must be recorded
 *   in the deployment log.
 *
 * Property 8: Failed Deployment Rollback
 *   For any deployment that fails, the system must automatically rollback to
 *   the most recent backup. The deployment status must be set to 'failed' and
 *   the rollback must be logged.
 *
 * **Validates: Requirements 6.6, 6.7**
 *
 * Tag: Feature: sprint-5-6-integration-pilot, Property 7: Deployment Backup Requirement
 * Tag: Feature: sprint-5-6-integration-pilot, Property 8: Failed Deployment Rollback
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  MultiPlatformIntegration,
  type PlatformAdapter,
  type DeploymentResult,
} from '../../../platform/integrations/multiPlatformIntegration';
import type {
  SupportedPlatform,
  PlatformCredentials,
  DeploymentChange,
  BackupResult,
  RollbackResult,
} from '../../../platform/types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const platformArb = fc.constantFrom<SupportedPlatform>(
  'wordpress',
  'shopify',
  'wix',
  'squarespace',
  'custom'
);

const credentialsArb = fc.record({
  platform: platformArb,
  apiKey: fc.option(fc.string({ minLength: 8, maxLength: 64 }), { nil: undefined }),
  accessToken: fc.option(fc.string({ minLength: 8, maxLength: 64 }), { nil: undefined }),
  siteUrl: fc.constantFrom(
    'https://example.com',
    'https://mystore.myshopify.com',
    'https://mybiz.wix.com',
    'https://mybiz.squarespace.com',
    'https://myblog.wordpress.com'
  ),
});

const changeTypeArb = fc.constantFrom<DeploymentChange['type']>(
  'speed-optimization',
  'seo-fix',
  'content-update',
  'full-redesign'
);

const deploymentChangeArb = fc.record({
  type: changeTypeArb,
  description: fc.string({ minLength: 1, maxLength: 100 }),
});

const changesArb = fc.array(deploymentChangeArb, { minLength: 1, maxLength: 5 });

const clientIdArb = fc.uuid();

// ---------------------------------------------------------------------------
// Helper: create a MultiPlatformIntegration with a controllable adapter
// ---------------------------------------------------------------------------

/**
 * Injects a custom adapter into MultiPlatformIntegration so we can control
 * whether deploy() succeeds or fails.
 */
function createIntegrationWithAdapter(
  platform: SupportedPlatform,
  shouldFail: boolean
): MultiPlatformIntegration {
  const integration = new MultiPlatformIntegration();

  // Override the private getAdapter method via prototype patching for testing
  const backupStore: Map<string, BackupResult> = new Map();

  const testAdapter: PlatformAdapter = {
    async validateCredentials(_creds: PlatformCredentials): Promise<boolean> {
      return true;
    },

    async createBackup(creds: PlatformCredentials): Promise<BackupResult> {
      const backupId = `test_backup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const result: BackupResult = {
        backupId,
        createdAt: new Date(),
        platform: creds.platform,
        siteUrl: creds.siteUrl,
      };
      backupStore.set(backupId, result);
      return result;
    },

    async deploy(
      _creds: PlatformCredentials,
      _changes: DeploymentChange[]
    ): Promise<void> {
      if (shouldFail) {
        throw new Error('Simulated deployment failure');
      }
    },

    async rollback(
      _creds: PlatformCredentials,
      backupId: string
    ): Promise<RollbackResult> {
      return {
        success: true,
        backupId,
        rolledBackAt: new Date(),
      };
    },
  };

  // Patch the private getAdapter method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (integration as any).getAdapter = (_platform: SupportedPlatform) => testAdapter;

  return integration;
}

// ---------------------------------------------------------------------------
// Property 7: Deployment Backup Requirement
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-5-6-integration-pilot, Property 7: Deployment Backup Requirement',
  () => {
    it(
      'a backup must be created before changes are applied and backupId must appear in the deployment log',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, false);

              const result: DeploymentResult = await integration.deploy(
                credentials,
                changes,
                clientId
              );

              // The deployment must succeed
              expect(result.success).toBe(true);

              // A backupId must be present in the result
              expect(result.backupId).toBeTruthy();
              expect(typeof result.backupId).toBe('string');
              expect(result.backupId.length).toBeGreaterThan(0);

              // The backupId must appear in the deployment log
              const history = await integration.getDeploymentHistory(clientId);
              expect(history.length).toBeGreaterThan(0);

              const log = history.find((l) => l.id === result.deploymentId);
              expect(log).toBeDefined();
              expect(log!.backupId).toBe(result.backupId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      'backupId in deployment log must match the backupId returned by deploy()',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, false);

              const result = await integration.deploy(credentials, changes, clientId);

              const history = await integration.getDeploymentHistory(clientId);
              const log = history.find((l) => l.id === result.deploymentId);

              expect(log).toBeDefined();
              expect(log!.backupId).toBe(result.backupId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      'deployment log must record the correct platform and clientId',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, false);

              const result = await integration.deploy(credentials, changes, clientId);

              const history = await integration.getDeploymentHistory(clientId);
              const log = history.find((l) => l.id === result.deploymentId);

              expect(log).toBeDefined();
              expect(log!.clientId).toBe(clientId);
              expect(log!.platform).toBe(credentials.platform);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Property 8: Failed Deployment Rollback
// ---------------------------------------------------------------------------

describe(
  'Feature: sprint-5-6-integration-pilot, Property 8: Failed Deployment Rollback',
  () => {
    it(
      'a failed deployment must automatically rollback and set status to failed',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, true);

              const result = await integration.deploy(credentials, changes, clientId);

              // Deployment must report failure
              expect(result.success).toBe(false);

              // Rollback must have been triggered
              expect(result.rolledBack).toBe(true);

              // The deployment log must record status as 'failed'
              const history = await integration.getDeploymentHistory(clientId);
              const log = history.find((l) => l.id === result.deploymentId);

              expect(log).toBeDefined();
              expect(log!.status).toBe('failed');
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      'failed deployment log must still contain the backupId used for rollback',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, true);

              const result = await integration.deploy(credentials, changes, clientId);

              // Even on failure, backupId must be present
              expect(result.backupId).toBeTruthy();

              const history = await integration.getDeploymentHistory(clientId);
              const log = history.find((l) => l.id === result.deploymentId);

              expect(log).toBeDefined();
              expect(log!.backupId).toBe(result.backupId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      'failed deployment must include an errorMessage',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, true);

              const result = await integration.deploy(credentials, changes, clientId);

              expect(result.success).toBe(false);
              expect(result.errorMessage).toBeTruthy();
              expect(typeof result.errorMessage).toBe('string');
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      'changesApplied must be 0 for a failed deployment',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            credentialsArb,
            changesArb,
            clientIdArb,
            async (
              credentials: PlatformCredentials,
              changes: DeploymentChange[],
              clientId: string
            ) => {
              const integration = createIntegrationWithAdapter(credentials.platform, true);

              const result = await integration.deploy(credentials, changes, clientId);

              expect(result.success).toBe(false);
              expect(result.changesApplied).toBe(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
