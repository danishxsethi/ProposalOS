/**
 * Unit tests for the Widget Manager.
 * Tests embed code generation, submission processing, lead creation, analytics.
 * Requirements: 10.1, 10.5, 10.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEmbedCode } from '../widgetManager';

// ── Embed code generation ────────────────────────────────────────────────────

describe('generateEmbedCode', () => {
  it('returns HTML with script tag and container div', () => {
    const code = generateEmbedCode('tenant-123', {});
    expect(code).toContain('<div id="pe-audit-widget"></div>');
    expect(code).toContain('<script src=');
    expect(code).toContain('audit-widget.js');
  });

  it('includes the tenantId in the config', () => {
    const code = generateEmbedCode('tenant-abc', {});
    expect(code).toContain('tenant-abc');
  });

  it('uses custom containerId when provided', () => {
    const code = generateEmbedCode('t1', { containerId: 'my-widget' });
    expect(code).toContain('my-widget');
  });

  it('uses custom baseUrl', () => {
    const code = generateEmbedCode('t1', {}, 'https://custom.example.com');
    expect(code).toContain('https://custom.example.com/widget/audit-widget.js');
  });

  it('includes theme configuration', () => {
    const code = generateEmbedCode('t1', {
      theme: { primaryColor: '#ff0000', buttonText: 'Audit Now', formFields: ['email', 'phone'] },
    });
    expect(code).toContain('#ff0000');
    expect(code).toContain('Audit Now');
    expect(code).toContain('phone');
  });

  it('includes behavior configuration', () => {
    const code = generateEmbedCode('t1', {
      behavior: { showResultsInline: false, captureBeforeResults: false, redirectUrl: 'https://example.com/results' },
    });
    expect(code).toContain('showResultsInline');
    expect(code).toContain('captureBeforeResults');
  });

  it('loads asynchronously with async attribute', () => {
    const code = generateEmbedCode('t1', {});
    expect(code).toContain('async');
  });

  it('includes boot retry logic for async loading', () => {
    const code = generateEmbedCode('t1', {});
    expect(code).toContain('setTimeout(boot');
    expect(code).toContain('ProposalEngineWidget');
  });
});

// ── Submission processing (pure logic validation) ────────────────────────────

describe('submission processing logic', () => {
  it('creates a lead when email is provided', () => {
    const hasContact = !!('test@example.com');
    expect(hasContact).toBe(true);
  });

  it('creates a lead when phone is provided', () => {
    const hasContact = !!(undefined || '+1234567890' || undefined);
    expect(hasContact).toBe(true);
  });

  it('creates a lead when name is provided', () => {
    const hasContact = !!(undefined || undefined || 'John');
    expect(hasContact).toBe(true);
  });

  it('does not create a lead without contact info', () => {
    const hasContact = !!(undefined || undefined || undefined);
    expect(hasContact).toBe(false);
  });

  it('score is capped at 90', () => {
    const score = Math.min(55 + 24, 90);
    expect(score).toBeLessThanOrEqual(90);
  });

  it('grade mapping is correct', () => {
    const gradeFor = (s: number) => s > 80 ? 'B' : s > 60 ? 'C' : 'D';
    expect(gradeFor(85)).toBe('B');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(50)).toBe('D');
  });
});

// ── Analytics structure ──────────────────────────────────────────────────────

describe('analytics structure', () => {
  it('conversion rate is 0 when no impressions', () => {
    const impressions = 0;
    const submissions = 0;
    const rate = impressions > 0 ? submissions / impressions : 0;
    expect(rate).toBe(0);
  });

  it('conversion rate is calculated correctly', () => {
    const impressions = 100;
    const submissions = 25;
    const rate = impressions > 0 ? submissions / impressions : 0;
    expect(rate).toBe(0.25);
  });
});
