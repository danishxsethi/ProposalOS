/**
 * Unit tests for WebsiteRedesignAgent
 *
 * Requirements: 1.1, 1.2, 1.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebsiteRedesignAgent } from '../websiteRedesignAgent';
import type { RedesignConfig } from '../websiteRedesignAgent';
import type { PlatformCredentials } from '../../../platform/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(): WebsiteRedesignAgent {
  return new WebsiteRedesignAgent();
}

const baseConfig: RedesignConfig = {
  clientId: 'client-001',
  proposalId: 'proposal-001',
  deliverableId: 'deliverable-001',
  existingSiteUrl: 'https://example.com',
  industry: 'plumbing',
  brandColors: ['#ff0000', '#ffffff'],
  designPreferences: { style: 'modern', layout: 'multi-page' },
};

const mockCredentials: PlatformCredentials = {
  platform: 'wordpress',
  siteUrl: 'https://example.com',
  apiKey: 'test-api-key',
};

// ---------------------------------------------------------------------------
// analyzeSite
// ---------------------------------------------------------------------------

describe('WebsiteRedesignAgent.analyzeSite', () => {
  it('returns a SiteAnalysis with the requested url', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(result.url).toBe('https://example.com');
  });

  it('returns a SiteAnalysis with a platform string', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(typeof result.platform).toBe('string');
    expect(result.platform.length).toBeGreaterThan(0);
  });

  it('returns a SiteAnalysis with a structure object', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(result.structure).toBeDefined();
    expect(typeof result.structure.pageCount).toBe('number');
    expect(typeof result.structure.hasNavigation).toBe('boolean');
    expect(typeof result.structure.hasBlog).toBe('boolean');
    expect(typeof result.structure.hasContactForm).toBe('boolean');
  });

  it('returns a SiteAnalysis with colors (primary, secondary, accent)', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(result.colors).toBeDefined();
    expect(typeof result.colors.primary).toBe('string');
    expect(typeof result.colors.secondary).toBe('string');
    expect(typeof result.colors.accent).toBe('string');
  });

  it('returns a SiteAnalysis with performance metrics', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(result.performance).toBeDefined();
    expect(typeof result.performance.lcp).toBe('number');
    expect(typeof result.performance.fid).toBe('number');
    expect(typeof result.performance.cls).toBe('number');
    expect(typeof result.performance.score).toBe('number');
  });

  it('returns a SiteAnalysis with mobileResponsive boolean', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://example.com');

    expect(typeof result.mobileResponsive).toBe('boolean');
  });

  it('detects wordpress platform from url', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://mysite.wordpress.com');

    expect(result.platform).toBe('wordpress');
  });

  it('detects shopify platform from url', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://mystore.shopify.com');

    expect(result.platform).toBe('shopify');
  });

  it('falls back to custom for unknown platforms', async () => {
    const agent = makeAgent();
    const result = await agent.analyzeSite('https://randomsite.io');

    expect(result.platform).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// generateMockup
// ---------------------------------------------------------------------------

describe('WebsiteRedesignAgent.generateMockup', () => {
  it('returns a RedesignMockup with a non-empty id', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(typeof mockup.id).toBe('string');
    expect(mockup.id.length).toBeGreaterThan(0);
  });

  it('returns a mockup with previewUrl initially empty', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    // previewUrl is set by createPreviewDeployment, not generateMockup
    expect(mockup.previewUrl).toBe('');
  });

  it('returns a mockup with status "draft"', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(mockup.status).toBe('draft');
  });

  it('returns a mockup with version 1', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(mockup.version).toBe(1);
  });

  it('returns a mockup with a codeBundle containing html and css', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(mockup.codeBundle).toBeDefined();
    expect(typeof mockup.codeBundle.html).toBe('string');
    expect(mockup.codeBundle.html.length).toBeGreaterThan(0);
    expect(typeof mockup.codeBundle.css).toBe('string');
    expect(mockup.codeBundle.css.length).toBeGreaterThan(0);
    expect(Array.isArray(mockup.codeBundle.assets)).toBe(true);
  });

  it('embeds the industry in the generated html', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(mockup.codeBundle.html).toContain('plumbing');
  });

  it('uses brand colors in the generated css', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(mockup.codeBundle.css).toContain('#ff0000');
  });

  it('returns a mockup with screenshotUrls for desktop and mobile', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(typeof mockup.screenshotUrls.desktop).toBe('string');
    expect(typeof mockup.screenshotUrls.mobile).toBe('string');
  });

  it('stores the mockup so it can be retrieved', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    expect(agent.getMockup(mockup.id)).toBeDefined();
    expect(agent.getMockup(mockup.id)?.id).toBe(mockup.id);
  });
});

// ---------------------------------------------------------------------------
// createPreviewDeployment
// ---------------------------------------------------------------------------

describe('WebsiteRedesignAgent.createPreviewDeployment', () => {
  it('returns a non-empty preview URL', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    const previewUrl = await agent.createPreviewDeployment(mockup);

    expect(typeof previewUrl).toBe('string');
    expect(previewUrl.length).toBeGreaterThan(0);
  });

  it('transitions mockup status from draft to pending_approval', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    const stored = agent.getMockup(mockup.id);
    expect(stored?.status).toBe('pending_approval');
  });

  it('sets the previewUrl on the stored mockup', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    const previewUrl = await agent.createPreviewDeployment(mockup);

    const stored = agent.getMockup(mockup.id);
    expect(stored?.previewUrl).toBe(previewUrl);
  });

  it('throws if mockup is not in draft status', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    // First call succeeds (draft → pending_approval)
    await agent.createPreviewDeployment(mockup);

    // Second call should throw because status is now pending_approval
    await expect(agent.createPreviewDeployment(mockup)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// deployToProduction
// ---------------------------------------------------------------------------

describe('WebsiteRedesignAgent.deployToProduction', () => {
  it('throws if mockup is not in approved status (draft)', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);

    await expect(
      agent.deployToProduction(mockup.id, mockCredentials)
    ).rejects.toThrow(/approved/);
  });

  it('throws if mockup is not in approved status (pending_approval)', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    await expect(
      agent.deployToProduction(mockup.id, mockCredentials)
    ).rejects.toThrow(/approved/);
  });

  it('throws if mockup id does not exist', async () => {
    const agent = makeAgent();

    await expect(
      agent.deployToProduction('nonexistent-id', mockCredentials)
    ).rejects.toThrow(/not found/i);
  });

  it('succeeds and returns a successful DeploymentResult when mockup is approved', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);
    agent.approveMockup(mockup.id);

    const result = await agent.deployToProduction(mockup.id, mockCredentials);

    expect(result.success).toBe(true);
    expect(result.mockupId).toBe(mockup.id);
  });

  it('transitions mockup status to deployed after successful deployment', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);
    agent.approveMockup(mockup.id);

    await agent.deployToProduction(mockup.id, mockCredentials);

    const stored = agent.getMockup(mockup.id);
    expect(stored?.status).toBe('deployed');
  });

  it('returns a deployedUrl in the result', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);
    agent.approveMockup(mockup.id);

    const result = await agent.deployToProduction(mockup.id, mockCredentials);

    expect(typeof result.deployedUrl).toBe('string');
    expect(result.deployedUrl.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// handleRejection
// ---------------------------------------------------------------------------

describe('WebsiteRedesignAgent.handleRejection', () => {
  it('marks the original mockup as rejected', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    await agent.handleRejection(mockup.id, 'Too dark, use lighter colors');

    const original = agent.getMockup(mockup.id);
    expect(original?.status).toBe('rejected');
  });

  it('returns a new mockup with version incremented by 1', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    const newMockup = await agent.handleRejection(mockup.id, 'Too dark');

    expect(newMockup.version).toBe(mockup.version + 1);
    expect(newMockup.version).toBe(2);
  });

  it('returns a new mockup with a different id', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    const newMockup = await agent.handleRejection(mockup.id, 'Too dark');

    expect(newMockup.id).not.toBe(mockup.id);
  });

  it('returns a new mockup with status draft', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    const newMockup = await agent.handleRejection(mockup.id, 'Too dark');

    expect(newMockup.status).toBe('draft');
  });

  it('stores the rejection feedback on the original mockup', async () => {
    const agent = makeAgent();
    const mockup = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockup);

    const feedback = 'Too dark, use lighter colors';
    await agent.handleRejection(mockup.id, feedback);

    const original = agent.getMockup(mockup.id);
    expect(original?.feedback).toBe(feedback);
  });

  it('increments version correctly across multiple rejection cycles', async () => {
    const agent = makeAgent();

    // Cycle 1: generate v1, reject → get v2
    const mockupV1 = await agent.generateMockup(baseConfig);
    await agent.createPreviewDeployment(mockupV1);
    const mockupV2 = await agent.handleRejection(mockupV1.id, 'Feedback 1');
    expect(mockupV2.version).toBe(2);

    // Cycle 2: deploy preview for v2, reject → get v3
    await agent.createPreviewDeployment(mockupV2);
    const mockupV3 = await agent.handleRejection(mockupV2.id, 'Feedback 2');
    expect(mockupV3.version).toBe(3);

    // Cycle 3: deploy preview for v3, reject → get v4
    await agent.createPreviewDeployment(mockupV3);
    const mockupV4 = await agent.handleRejection(mockupV3.id, 'Feedback 3');
    expect(mockupV4.version).toBe(4);
  });

  it('throws if mockup id does not exist', async () => {
    const agent = makeAgent();

    await expect(
      agent.handleRejection('nonexistent-id', 'feedback')
    ).rejects.toThrow(/not found/i);
  });
});
