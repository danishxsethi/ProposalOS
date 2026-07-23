/**
 * Squarespace Adapter
 *
 * Implements the PlatformAdapter interface for Squarespace sites via the
 * Squarespace API.
 *
 * Requirements: 6.1
 */

import type {
  PlatformCredentials,
  DeploymentChange,
  BackupResult,
  RollbackResult,
} from '../../types';
import type { PlatformAdapter } from '../multiPlatformIntegration';

// ---------------------------------------------------------------------------
// Squarespace-specific types
// ---------------------------------------------------------------------------

export interface SquarespacePageUpdate {
  pageId: string;
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface SquarespaceStyleUpdate {
  tweaks: Record<string, string>;
}

// ---------------------------------------------------------------------------
// SquarespaceAdapter
// ---------------------------------------------------------------------------

export class SquarespaceAdapter implements PlatformAdapter {
  // -------------------------------------------------------------------------
  // PlatformAdapter interface
  // -------------------------------------------------------------------------

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    // Stub: Squarespace requires an apiKey and siteUrl
    const hasAuth = !!(credentials.apiKey ?? credentials.accessToken);
    const hasUrl = !!credentials.siteUrl;
    return hasAuth && hasUrl;
  }

  async createBackup(credentials: PlatformCredentials): Promise<BackupResult> {
    // Stub: snapshot current Squarespace site state
    const backupId = `sqsp_backup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return {
      backupId,
      createdAt: new Date(),
      platform: 'squarespace',
      siteUrl: credentials.siteUrl,
    };
  }

  async deploy(
    credentials: PlatformCredentials,
    changes: DeploymentChange[]
  ): Promise<void> {
    for (const change of changes) {
      switch (change.type) {
        case 'speed-optimization':
          await this.applySpeedOptimization(credentials, change);
          break;
        case 'seo-fix':
          await this.applySEOFix(credentials, change);
          break;
        case 'content-update':
          await this.applyContentUpdate(credentials, change);
          break;
        case 'full-redesign':
          await this.applyFullRedesign(credentials, change);
          break;
        default:
          break;
      }
    }
  }

  async rollback(
    credentials: PlatformCredentials,
    backupId: string
  ): Promise<RollbackResult> {
    // Stub: restore Squarespace site from backup
    return {
      success: true,
      backupId,
      rolledBackAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Squarespace-specific operations
  // -------------------------------------------------------------------------

  /**
   * Update a Squarespace page's metadata and SEO fields.
   */
  async updatePage(
    _credentials: PlatformCredentials,
    update: SquarespacePageUpdate
  ): Promise<void> {
    // Stub: PATCH /api/pages/{pageId}
    void update;
  }

  /**
   * Update Squarespace style tweaks (colors, fonts, spacing).
   */
  async updateStyles(
    _credentials: PlatformCredentials,
    styleUpdate: SquarespaceStyleUpdate
  ): Promise<void> {
    // Stub: POST /api/styles/tweaks
    void styleUpdate;
  }

  // -------------------------------------------------------------------------
  // Private change handlers
  // -------------------------------------------------------------------------

  private async applySpeedOptimization(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    // Squarespace speed: optimize via style tweaks (lazy load, etc.)
    await this.updateStyles(credentials, {
      tweaks: {
        'enable-lazy-load': 'true',
        ...(change.settings as Record<string, string> | undefined),
      },
    });
  }

  private async applySEOFix(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    if (change.settings?.pageId) {
      await this.updatePage(credentials, {
        pageId: change.settings.pageId as string,
        seoTitle: (change.settings.title as string) ?? '',
        seoDescription: (change.settings.description as string) ?? '',
      });
    }
  }

  private async applyContentUpdate(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    if (change.settings?.pageId) {
      await this.updatePage(credentials, {
        pageId: change.settings.pageId as string,
        title: (change.settings.title as string) ?? '',
        description: (change.settings.description as string) ?? '',
      });
    }
  }

  private async applyFullRedesign(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    if (change.settings?.tweaks) {
      await this.updateStyles(credentials, {
        tweaks: change.settings.tweaks as Record<string, string>,
      });
    }
  }
}
