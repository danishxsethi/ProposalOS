/**
 * tests/e2e/critical-flows.test.ts
 * 
 * E2E Tests for Critical User Flows
 * 
 * Note: These tests require a running application and database.
 * Run with: npx playwright test tests/e2e/critical-flows.test.ts
 */

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Critical Flow: Audit → Findings → Proposal', () => {
  test('should complete full audit flow', async ({ page }) => {
    // Step 1: Navigate to audit form
    await page.goto(`${BASE_URL}/new-audit`);
    await expect(page).toHaveTitle(/Audit/i);

    // Step 2: Fill audit form
    await page.fill('input[name="businessUrl"]', 'https://example.com');
    await page.fill('input[name="businessName"]', 'Test Business');
    await page.fill('input[name="businessCity"]', 'Test City');
    await page.selectOption('select[name="businessIndustry"]', 'general');

    // Step 3: Submit audit
    await page.click('button[type="submit"]');

    // Step 4: Wait for completion (polling)
    await page.waitForSelector('[data-testid="audit-complete"]', { timeout: 60000 });

    // Step 5: Verify findings displayed
    const findingsCount = await page.locator('[data-testid="finding-card"]').count();
    expect(findingsCount).toBeGreaterThan(0);

    // Step 6: Generate proposal
    await page.click('button:has-text("Generate Proposal")');

    // Step 7: Wait for proposal
    await page.waitForSelector('[data-testid="proposal-tiers"]', { timeout: 30000 });

    // Step 8: Verify proposal tiers
    const tiers = await page.locator('[data-testid="proposal-tier"]').count();
    expect(tiers).toBe(3);

    // Step 9: Verify executive summary is specific (not generic)
    const summary = await page.locator('[data-testid="executive-summary"]').textContent();
    expect(summary).not.toContain('lorem ipsum');
    expect(summary?.length).toBeGreaterThan(50);
  });
});

test.describe('Critical Flow: White-label Partner', () => {
  test('should authenticate via API key and retrieve results', async ({ request }) => {
    const apiKey = process.env.TEST_API_KEY || 'test-key';

    // Step 1: Trigger audit via API
    const createResponse = await request.post(`${BASE_URL}/api/audit`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      data: {
        businessUrl: 'https://example.com',
        businessName: 'API Test Business',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const { auditId } = await createResponse.json();
    expect(auditId).toBeDefined();

    // Step 2: Poll for completion
    let status = 'QUEUED';
    let attempts = 0;
    const maxAttempts = 30;

    while (status === 'QUEUED' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      const statusResponse = await request.get(`${BASE_URL}/api/audit/${auditId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const data = await statusResponse.json();
      status = data.status;
      attempts++;
    }

    expect(['COMPLETE', 'PARTIAL', 'DEGRADED']).toContain(status);

    // Step 3: Retrieve findings
    const findingsResponse = await request.get(`${BASE_URL}/api/audit/${auditId}/findings`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    expect(findingsResponse.ok()).toBeTruthy();
    const findings = await findingsResponse.json();
    expect(Array.isArray(findings)).toBeTruthy();
  });
});

test.describe('Critical Flow: Batch Mode', () => {
  test('should process 10 URLs with progress tracking', async ({ request }) => {
    const apiKey = process.env.TEST_API_KEY || 'test-key';

    // Step 1: Submit batch of 10 URLs
    const batchUrls = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example${i}.com`,
      businessName: `Business ${i}`,
    }));

    const batchResponse = await request.post(`${BASE_URL}/api/audit/batch`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      data: {
        name: 'Batch Test',
        items: batchUrls,
      },
    });

    expect(batchResponse.ok()).toBeTruthy();
    const { batchId, auditIds } = await batchResponse.json();
    expect(batchId).toBeDefined();
    expect(auditIds).toHaveLength(10);

    // Step 2: Track progress
    let completed = 0;
    let attempts = 0;
    const maxAttempts = 60;

    while (completed < 10 && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000));
      const progressResponse = await request.get(`${BASE_URL}/api/audit/batch/${batchId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const progress = await progressResponse.json();
      completed = progress.completed || 0;
      attempts++;
    }

    // At least 9 should complete (allowing 1 failure)
    expect(completed).toBeGreaterThanOrEqual(9);

    // Step 3: Download results
    const downloadResponse = await request.get(`${BASE_URL}/api/audit/batch/${batchId}/download`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    expect([200, 202]).toContain(downloadResponse.status());
  });
});

test.describe('Critical Flow: Cold Outreach', () => {
  test('should create campaign and verify delivery', async ({ request }) => {
    const apiKey = process.env.TEST_API_KEY || 'test-key';

    // Step 1: Create campaign
    const campaignResponse = await request.post(`${BASE_URL}/api/outreach/campaign`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      data: {
        name: 'Test Campaign',
        templateId: 'template-1',
        targetAudience: 'dentists',
      },
    });

    expect(campaignResponse.ok()).toBeTruthy();
    const { campaignId } = await campaignResponse.json();
    expect(campaignId).toBeDefined();

    // Step 2: Send test email
    const testResponse = await request.post(`${BASE_URL}/api/outreach/campaign/${campaignId}/test`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      data: {
        recipientEmail: 'test@example.com',
      },
    });

    expect(testResponse.ok()).toBeTruthy();

    // Step 3: Verify delivery status
    const statusResponse = await request.get(`${BASE_URL}/api/outreach/campaign/${campaignId}/status`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    const status = await statusResponse.json();
    expect(status.testSent).toBeTruthy();
  });
});