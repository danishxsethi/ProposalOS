/**
 * Website Redesign Agent
 *
 * AI-powered agent for generating and deploying complete website redesigns.
 * Uses stub/placeholder logic for v0/screenshot-to-code integrations that
 * can be replaced with real API calls.
 *
 * Status flow: draft → pending_approval → approved → deployed
 * SLAs: mockup generation ≤ 5 min, deployment ≤ 15 min
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { BaseDeliveryAgent } from './baseDeliveryAgent';
import type {
  DeliveryAgentContext,
  DeliveryAgentResult,
  DeliveryAgentType,
} from './baseDeliveryAgent';
import type { PlatformCredentials } from '../../platform/types';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface SiteAnalysis {
  url: string;
  /** Detected CMS / platform (e.g. 'wordpress', 'shopify', 'custom') */
  platform: string;
  /** Page structure summary */
  structure: {
    pageCount: number;
    hasNavigation: boolean;
    hasBlog: boolean;
    hasContactForm: boolean;
  };
  /** Dominant brand colours extracted from the site */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  /** Core Web Vitals snapshot */
  performance: {
    lcp: number;   // Largest Contentful Paint (ms)
    fid: number;   // First Input Delay (ms)
    cls: number;   // Cumulative Layout Shift score
    score: number; // 0-100 overall performance score
  };
  /** Whether the site is mobile-responsive */
  mobileResponsive: boolean;
  analyzedAt: Date;
}

export interface RedesignConfig {
  clientId: string;
  proposalId: string;
  deliverableId: string;
  existingSiteUrl: string;
  brandColors?: string[];
  industry: string;
  designPreferences?: {
    style: 'modern' | 'classic' | 'minimal' | 'bold';
    layout: 'single-page' | 'multi-page';
  };
}

export type MockupStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'deployed';

export interface RedesignMockup {
  id: string;
  previewUrl: string;
  screenshotUrls: { desktop: string; mobile: string };
  generatedAt: Date;
  designTool: 'v0' | 'screenshot-to-code' | 'custom';
  codeBundle: {
    html: string;
    css: string;
    assets: string[];
  };
  status: MockupStatus;
  version: number;
  feedback?: string;
}

export interface DeploymentResult {
  success: boolean;
  mockupId: string;
  deployedUrl: string;
  platform: string;
  deployedAt: Date;
  backupId?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// SLA constants
// ---------------------------------------------------------------------------

const MOCKUP_GENERATION_SLA_MS = 5 * 60 * 1000;   // 5 minutes
const DEPLOYMENT_SLA_MS = 15 * 60 * 1000;          // 15 minutes

// ---------------------------------------------------------------------------
// In-memory mockup store (stub — replace with DB persistence)
// ---------------------------------------------------------------------------

const mockupStore = new Map<string, RedesignMockup>();

// ---------------------------------------------------------------------------
// Agent implementation
// ---------------------------------------------------------------------------

export class WebsiteRedesignAgent extends BaseDeliveryAgent {
  getAgentType(): DeliveryAgentType {
    return 'website_redesign';
  }

  /**
   * BaseDeliveryAgent.execute() entry point.
   * Reads `config` from context and runs the full redesign pipeline.
   */
  async execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    this.status = 'in_progress';

    const config = context.config as unknown as RedesignConfig;

    try {
      // 1. Analyse existing site
      const analysis = await this.analyzeSite(config.existingSiteUrl);

      // 2. Generate mockup
      const mockup = await this.generateMockup(config);

      // 3. Create preview deployment (transitions to pending_approval)
      const previewUrl = await this.createPreviewDeployment(mockup);

      this.status = 'awaiting_approval';

      return {
        success: true,
        summary: `Redesign mockup v${mockup.version} generated and preview deployed`,
        data: {
          mockupId: mockup.id,
          previewUrl,
          analysis,
          status: mockup.status,
        },
        costCents: 250, // stub cost
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: `Website redesign failed: ${message}`,
        costCents: 0,
        completedAt: new Date().toISOString(),
        error: message,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Public agent methods
  // -------------------------------------------------------------------------

  /**
   * Analyse an existing site for structure, colours, and performance.
   * Stub: returns synthesised data. Replace with real crawler / Lighthouse call.
   */
  async analyzeSite(url: string): Promise<SiteAnalysis> {
    this.log(`Analysing site: ${url}`);

    // Stub: simulate a lightweight analysis
    const analysis: SiteAnalysis = {
      url,
      platform: this._detectPlatformFromUrl(url),
      structure: {
        pageCount: 5,
        hasNavigation: true,
        hasBlog: false,
        hasContactForm: true,
      },
      colors: {
        primary: '#1a73e8',
        secondary: '#ffffff',
        accent: '#fbbc04',
      },
      performance: {
        lcp: 4200,
        fid: 120,
        cls: 0.18,
        score: 52,
      },
      mobileResponsive: false,
      analyzedAt: new Date(),
    };

    return analysis;
  }

  /**
   * Generate a redesign mockup using v0/screenshot-to-code integration.
   * Enforces the 5-minute SLA.
   *
   * Stub: returns a synthesised mockup. Replace with real v0 API call.
   */
  async generateMockup(config: RedesignConfig): Promise<RedesignMockup> {
    this.log(`Generating mockup for client ${config.clientId}`);

    const startedAt = Date.now();

    // Stub: simulate AI design generation
    const mockup = await this._generateMockupWithTimeout(config, startedAt);

    // Enforce SLA
    const elapsed = Date.now() - startedAt;
    if (elapsed > MOCKUP_GENERATION_SLA_MS) {
      throw new Error(
        `Mockup generation SLA exceeded: took ${elapsed}ms, limit is ${MOCKUP_GENERATION_SLA_MS}ms`
      );
    }

    // Persist to store
    mockupStore.set(mockup.id, mockup);

    return mockup;
  }

  /**
   * Create a staging preview deployment for client approval.
   * Transitions mockup status: draft → pending_approval.
   * Returns the preview URL.
   */
  async createPreviewDeployment(mockup: RedesignMockup): Promise<string> {
    this.log(`Creating preview deployment for mockup ${mockup.id}`);

    // Retrieve from store (may have been passed directly)
    const stored = mockupStore.get(mockup.id) ?? mockup;

    if (stored.status !== 'draft') {
      throw new Error(
        `Cannot create preview for mockup in status '${stored.status}'; expected 'draft'`
      );
    }

    // Stub: generate a staging URL
    const previewUrl = `https://preview.staging.example.com/redesign/${stored.id}`;

    // Transition status
    const updated: RedesignMockup = {
      ...stored,
      previewUrl,
      status: 'pending_approval',
    };
    mockupStore.set(updated.id, updated);

    return previewUrl;
  }

  /**
   * Deploy an approved mockup to production via the Multi-Platform Integration Layer.
   * Enforces the 15-minute deployment SLA.
   * Mockup must be in 'approved' status (never skip preview).
   */
  async deployToProduction(
    mockupId: string,
    platformCredentials: PlatformCredentials
  ): Promise<DeploymentResult> {
    this.log(`Deploying mockup ${mockupId} to production`);

    const mockup = mockupStore.get(mockupId);
    if (!mockup) {
      throw new Error(`Mockup not found: ${mockupId}`);
    }

    // Enforce status gate — must have gone through preview
    if (mockup.status !== 'approved') {
      throw new Error(
        `Cannot deploy mockup in status '${mockup.status}'; mockup must be 'approved' before production deployment`
      );
    }

    const startedAt = Date.now();

    // Stub: simulate deployment via Multi-Platform Integration Layer
    const result = await this._deployViaPlatformIntegration(
      mockup,
      platformCredentials,
      startedAt
    );

    // Enforce SLA
    const elapsed = Date.now() - startedAt;
    if (elapsed > DEPLOYMENT_SLA_MS) {
      throw new Error(
        `Deployment SLA exceeded: took ${elapsed}ms, limit is ${DEPLOYMENT_SLA_MS}ms`
      );
    }

    if (result.success) {
      // Transition to deployed
      const updated: RedesignMockup = { ...mockup, status: 'deployed' };
      mockupStore.set(mockupId, updated);
    }

    return result;
  }

  /**
   * Handle client rejection by generating a new mockup version.
   * Increments the version number and incorporates feedback.
   */
  async handleRejection(mockupId: string, feedback: string): Promise<RedesignMockup> {
    this.log(`Handling rejection for mockup ${mockupId}`);

    const original = mockupStore.get(mockupId);
    if (!original) {
      throw new Error(`Mockup not found: ${mockupId}`);
    }

    // Mark original as rejected
    const rejected: RedesignMockup = { ...original, status: 'rejected', feedback };
    mockupStore.set(mockupId, rejected);

    // Generate new version incorporating feedback
    const newMockup = await this._generateRevision(rejected, feedback);
    mockupStore.set(newMockup.id, newMockup);

    return newMockup;
  }

  // -------------------------------------------------------------------------
  // Helpers for testing / inspection
  // -------------------------------------------------------------------------

  /** Retrieve a mockup from the in-memory store (useful for tests). */
  getMockup(mockupId: string): RedesignMockup | undefined {
    return mockupStore.get(mockupId);
  }

  /** Manually set a mockup's status (used in tests to simulate approval). */
  approveMockup(mockupId: string): void {
    const mockup = mockupStore.get(mockupId);
    if (!mockup) throw new Error(`Mockup not found: ${mockupId}`);
    if (mockup.status !== 'pending_approval') {
      throw new Error(
        `Cannot approve mockup in status '${mockup.status}'; expected 'pending_approval'`
      );
    }
    mockupStore.set(mockupId, { ...mockup, status: 'approved' });
  }

  // -------------------------------------------------------------------------
  // Private stub helpers
  // -------------------------------------------------------------------------

  private _detectPlatformFromUrl(url: string): string {
    if (url.includes('wordpress') || url.includes('wp-')) return 'wordpress';
    if (url.includes('shopify')) return 'shopify';
    if (url.includes('wix')) return 'wix';
    if (url.includes('squarespace')) return 'squarespace';
    return 'custom';
  }

  private async _generateMockupWithTimeout(
    config: RedesignConfig,
    _startedAt: number
  ): Promise<RedesignMockup> {
    // Stub: in production, call v0 or screenshot-to-code API here
    const id = `mockup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const style = config.designPreferences?.style ?? 'modern';
    const layout = config.designPreferences?.layout ?? 'multi-page';

    const mockup: RedesignMockup = {
      id,
      previewUrl: '', // set by createPreviewDeployment
      screenshotUrls: {
        desktop: `https://screenshots.example.com/${id}/desktop.png`,
        mobile: `https://screenshots.example.com/${id}/mobile.png`,
      },
      generatedAt: new Date(),
      designTool: 'v0',
      codeBundle: {
        html: this._generateStubHtml(config, style, layout),
        css: this._generateStubCss(config),
        assets: [],
      },
      status: 'draft',
      version: 1,
    };

    return mockup;
  }

  private async _generateRevision(
    original: RedesignMockup,
    feedback: string
  ): Promise<RedesignMockup> {
    // Stub: in production, pass feedback to v0/AI to generate revised design
    const id = `mockup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const revised: RedesignMockup = {
      ...original,
      id,
      previewUrl: '', // will be set by createPreviewDeployment
      generatedAt: new Date(),
      status: 'draft',
      version: original.version + 1,
      feedback,
      codeBundle: {
        ...original.codeBundle,
        html: original.codeBundle.html.replace(
          '</body>',
          `<!-- Revision v${original.version + 1}: ${feedback} --></body>`
        ),
      },
    };

    return revised;
  }

  private async _deployViaPlatformIntegration(
    mockup: RedesignMockup,
    credentials: PlatformCredentials,
    _startedAt: number
  ): Promise<DeploymentResult> {
    // Stub: in production, call MultiPlatformIntegration.deploy() here
    const backupId = `backup-${Date.now()}`;
    const deployedUrl = credentials.siteUrl.replace(/\/$/, '') + '/';

    return {
      success: true,
      mockupId: mockup.id,
      deployedUrl,
      platform: credentials.platform,
      deployedAt: new Date(),
      backupId,
    };
  }

  private _generateStubHtml(
    config: RedesignConfig,
    style: string,
    layout: string
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.industry} Website Redesign</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="${style} ${layout}">
  <!-- Generated by WebsiteRedesignAgent v1 -->
  <!-- Industry: ${config.industry} -->
  <header><nav></nav></header>
  <main></main>
  <footer></footer>
</body>
</html>`;
  }

  private _generateStubCss(config: RedesignConfig): string {
    const primary = config.brandColors?.[0] ?? '#1a73e8';
    const secondary = config.brandColors?.[1] ?? '#ffffff';
    return `/* Generated by WebsiteRedesignAgent */
:root {
  --color-primary: ${primary};
  --color-secondary: ${secondary};
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; color: #333; }
@media (max-width: 768px) { body { font-size: 16px; } }`;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const websiteRedesignAgent = new WebsiteRedesignAgent();
