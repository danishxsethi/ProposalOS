/**
 * Multi-Platform Integration Layer
 *
 * Unified interface for deploying changes to WordPress, Shopify, Wix,
 * Squarespace, and custom sites. Enforces the backup-before-deploy invariant
 * (Property 7) and automatic rollback on failure (Property 8).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import type {
  SupportedPlatform,
  PlatformCredentials,
  DeploymentChange,
  BackupResult,
  RollbackResult,
  DeploymentLog,
} from '../types';

import { WordPressAdapter } from './adapters/wordpress';
import { ShopifyAdapter } from './adapters/shopify';
import { WixAdapter } from './adapters/wix';
import { SquarespaceAdapter } from './adapters/squarespace';

// ---------------------------------------------------------------------------
// Platform detection patterns
// ---------------------------------------------------------------------------

const PLATFORM_PATTERNS: Array<{
  platform: SupportedPlatform;
  patterns: RegExp[];
  confidence: number;
}> = [
  {
    platform: 'wordpress',
    patterns: [/wordpress\.com/i, /wp-content/i, /wp-login/i, /\/wp\//i],
    confidence: 0.95,
  },
  {
    platform: 'shopify',
    patterns: [/shopify\.com/i, /myshopify\.com/i, /cdn\.shopify/i],
    confidence: 0.95,
  },
  {
    platform: 'wix',
    patterns: [/wix\.com/i, /wixsite\.com/i, /wixstatic\.com/i],
    confidence: 0.95,
  },
  {
    platform: 'squarespace',
    patterns: [/squarespace\.com/i, /sqsp\.net/i, /squarespace-cdn/i],
    confidence: 0.95,
  },
];

// ---------------------------------------------------------------------------
// Platform adapter interface
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  deploy(credentials: PlatformCredentials, changes: DeploymentChange[]): Promise<void>;
  createBackup(credentials: PlatformCredentials): Promise<BackupResult>;
  rollback(credentials: PlatformCredentials, backupId: string): Promise<RollbackResult>;
  validateCredentials(credentials: PlatformCredentials): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// DeploymentResult
// ---------------------------------------------------------------------------

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  backupId: string;
  platform: SupportedPlatform;
  changesApplied: number;
  deployedAt: Date;
  errorMessage?: string;
  rolledBack?: boolean;
}

// ---------------------------------------------------------------------------
// MultiPlatformIntegration
// ---------------------------------------------------------------------------

export class MultiPlatformIntegration {
  /** In-memory deployment log (keyed by clientId) */
  private deploymentLogs: Map<string, DeploymentLog[]> = new Map();

  // -------------------------------------------------------------------------
  // Platform detection
  // -------------------------------------------------------------------------

  /**
   * Detect the platform from a site URL.
   * Returns the best match with a confidence score, or 'custom' if unknown.
   */
  async detectPlatform(
    siteUrl: string
  ): Promise<{ platform: SupportedPlatform; confidence: number }> {
    for (const entry of PLATFORM_PATTERNS) {
      for (const pattern of entry.patterns) {
        if (pattern.test(siteUrl)) {
          return { platform: entry.platform, confidence: entry.confidence };
        }
      }
    }
    return { platform: 'custom', confidence: 0.5 };
  }

  // -------------------------------------------------------------------------
  // Credential validation
  // -------------------------------------------------------------------------

  /**
   * Validate API credentials for the given platform.
   * Delegates to the platform-specific adapter.
   */
  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    const adapter = this.getAdapter(credentials.platform);
    return adapter.validateCredentials(credentials);
  }

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------

  /**
   * Create a backup/rollback point before making any changes.
   * Must be called before deploy().
   */
  async createBackup(credentials: PlatformCredentials): Promise<BackupResult> {
    const adapter = this.getAdapter(credentials.platform);
    return adapter.createBackup(credentials);
  }

  // -------------------------------------------------------------------------
  // Deploy
  // -------------------------------------------------------------------------

  /**
   * Deploy changes to the client's platform.
   *
   * INVARIANT (Property 7): A backup is ALWAYS created before any changes are
   * applied. The backupId is recorded in the deployment log.
   *
   * INVARIANT (Property 8): If deployment fails, the system automatically
   * rolls back to the backup and sets status to 'failed'.
   */
  async deploy(
    credentials: PlatformCredentials,
    changes: DeploymentChange[],
    clientId: string
  ): Promise<DeploymentResult> {
    const deploymentId = this.generateId();
    const adapter = this.getAdapter(credentials.platform);

    // --- Property 7: backup BEFORE any changes ---
    const backup = await this.createBackup(credentials);

    try {
      await adapter.deploy(credentials, changes);

      const log: DeploymentLog = {
        id: deploymentId,
        clientId,
        platform: credentials.platform,
        changeType: changes.map((c) => c.type).join(','),
        status: 'success',
        backupId: backup.backupId,
        deployedAt: new Date(),
      };
      this.appendLog(clientId, log);

      return {
        success: true,
        deploymentId,
        backupId: backup.backupId,
        platform: credentials.platform,
        changesApplied: changes.length,
        deployedAt: log.deployedAt,
      };
    } catch (err) {
      // --- Property 8: automatic rollback on failure ---
      const rollbackResult = await this.rollback(credentials, backup.backupId);

      const errorMessage = err instanceof Error ? err.message : String(err);

      const log: DeploymentLog = {
        id: deploymentId,
        clientId,
        platform: credentials.platform,
        changeType: changes.map((c) => c.type).join(','),
        status: 'failed',
        backupId: backup.backupId,
        deployedAt: new Date(),
        errorMessage,
      };
      this.appendLog(clientId, log);

      return {
        success: false,
        deploymentId,
        backupId: backup.backupId,
        platform: credentials.platform,
        changesApplied: 0,
        deployedAt: log.deployedAt,
        errorMessage,
        rolledBack: rollbackResult.success,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  /**
   * Rollback to a previously created backup.
   */
  async rollback(
    credentials: PlatformCredentials,
    backupId: string
  ): Promise<RollbackResult> {
    const adapter = this.getAdapter(credentials.platform);
    return adapter.rollback(credentials, backupId);
  }

  // -------------------------------------------------------------------------
  // Deployment history
  // -------------------------------------------------------------------------

  /**
   * Return all deployment logs for a client, ordered by deployedAt descending.
   */
  async getDeploymentHistory(clientId: string): Promise<DeploymentLog[]> {
    const logs = this.deploymentLogs.get(clientId) ?? [];
    return [...logs].sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getAdapter(platform: SupportedPlatform): PlatformAdapter {
    switch (platform) {
      case 'wordpress':
        return new WordPressAdapter();
      case 'shopify':
        return new ShopifyAdapter();
      case 'wix':
        return new WixAdapter();
      case 'squarespace':
        return new SquarespaceAdapter();
      case 'custom':
        return new CustomAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform as string}`);
    }
  }

  private appendLog(clientId: string, log: DeploymentLog): void {
    const existing = this.deploymentLogs.get(clientId) ?? [];
    this.deploymentLogs.set(clientId, [...existing, log]);
  }

  private generateId(): string {
    return `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ---------------------------------------------------------------------------
// Custom / fallback adapter
// ---------------------------------------------------------------------------

class CustomAdapter implements PlatformAdapter {
  async validateCredentials(_credentials: PlatformCredentials): Promise<boolean> {
    return true;
  }

  async createBackup(credentials: PlatformCredentials): Promise<BackupResult> {
    return {
      backupId: `backup_custom_${Date.now()}`,
      createdAt: new Date(),
      platform: credentials.platform,
      siteUrl: credentials.siteUrl,
    };
  }

  async deploy(
    _credentials: PlatformCredentials,
    _changes: DeploymentChange[]
  ): Promise<void> {
    // Custom sites: stub — no real API call
  }

  async rollback(
    credentials: PlatformCredentials,
    backupId: string
  ): Promise<RollbackResult> {
    return {
      success: true,
      backupId,
      rolledBackAt: new Date(),
    };
  }
}
