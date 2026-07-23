/**
 * Shopify Adapter
 *
 * Implements the PlatformAdapter interface for Shopify stores via the
 * Shopify Admin API. Supports theme settings updates and metafield management.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5
 */

import type {
  PlatformCredentials,
  DeploymentChange,
  BackupResult,
  RollbackResult,
} from '../../types';
import type { PlatformAdapter } from '../multiPlatformIntegration';

// ---------------------------------------------------------------------------
// Shopify-specific types
// ---------------------------------------------------------------------------

export interface Metafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ThemeSettingsResult {
  updated: boolean;
  settingsApplied: number;
}

export interface MetafieldResult {
  created: number;
  updated: number;
}

// ---------------------------------------------------------------------------
// ShopifyAdapter
// ---------------------------------------------------------------------------

export class ShopifyAdapter implements PlatformAdapter {
  // -------------------------------------------------------------------------
  // PlatformAdapter interface
  // -------------------------------------------------------------------------

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    // Stub: Shopify requires an accessToken and a myshopify.com siteUrl
    const hasToken = !!credentials.accessToken;
    const hasUrl = !!credentials.siteUrl;
    return hasToken && hasUrl;
  }

  async createBackup(credentials: PlatformCredentials): Promise<BackupResult> {
    // Stub: snapshot current theme settings and metafields
    const backupId = `shopify_backup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return {
      backupId,
      createdAt: new Date(),
      platform: 'shopify',
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
    // Stub: restore theme settings from backup snapshot
    return {
      success: true,
      backupId,
      rolledBackAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Shopify-specific operations
  // -------------------------------------------------------------------------

  /**
   * Update Shopify theme settings (colors, fonts, layout, etc.).
   */
  async updateThemeSettings(
    _credentials: PlatformCredentials,
    settings: Record<string, unknown>
  ): Promise<ThemeSettingsResult> {
    // Stub: PUT /admin/api/2024-01/themes/{theme_id}/assets.json
    return {
      updated: true,
      settingsApplied: Object.keys(settings).length,
    };
  }

  /**
   * Add or update metafields on the Shopify store.
   */
  async addMetafields(
    _credentials: PlatformCredentials,
    metafields: Metafield[]
  ): Promise<MetafieldResult> {
    // Stub: POST /admin/api/2024-01/metafields.json
    return {
      created: metafields.length,
      updated: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private change handlers
  // -------------------------------------------------------------------------

  private async applySpeedOptimization(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    // Enable lazy loading, compress assets via theme settings
    await this.updateThemeSettings(credentials, {
      lazyLoad: true,
      compressAssets: true,
      ...(change.settings ?? {}),
    });
  }

  private async applySEOFix(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    // Update SEO metafields
    const metafields: Metafield[] = [
      {
        namespace: 'seo',
        key: 'title',
        value: (change.settings?.title as string) ?? '',
        type: 'single_line_text_field',
      },
      {
        namespace: 'seo',
        key: 'description',
        value: (change.settings?.description as string) ?? '',
        type: 'single_line_text_field',
      },
    ].filter((m) => m.value);

    if (metafields.length > 0) {
      await this.addMetafields(credentials, metafields);
    }
  }

  private async applyContentUpdate(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    if (change.settings) {
      await this.updateThemeSettings(credentials, change.settings);
    }
  }

  private async applyFullRedesign(
    credentials: PlatformCredentials,
    change: DeploymentChange
  ): Promise<void> {
    if (change.settings) {
      await this.updateThemeSettings(credentials, change.settings);
    }
  }
}
