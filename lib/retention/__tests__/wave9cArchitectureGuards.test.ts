/**
 * Wave 9C architecture guard: proves lifecycle retention modules (NPS, win-back,
 * re-engagement, upsell) use tenant context and contain no fabricated marketing
 * claims with specific unsupported numbers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RETENTION_DIR = join(__dirname, '..');

function readSource(file: string): string {
  return readFileSync(join(RETENTION_DIR, file), 'utf-8');
}

describe('Wave 9C lifecycle architecture guards', () => {
  it('nps.ts uses runWithTenantAsync for tenant-scoped operations', () => {
    const src = readSource('nps.ts');
    expect(src).toMatch(/runWithTenantAsync/);
  });

  it('win-back.ts uses runWithTenantAsync for tenant-scoped operations', () => {
    const src = readSource('win-back.ts');
    expect(src).toMatch(/runWithTenantAsync/);
  });

  it('re-engagement.ts uses runWithTenantAsync for tenant-scoped operations', () => {
    const src = readSource('re-engagement.ts');
    expect(src).toMatch(/runWithTenantAsync/);
  });

  it('nps.ts, win-back.ts, re-engagement.ts route sends through guardLifecycleSend', () => {
    for (const file of ['nps.ts', 'win-back.ts', 're-engagement.ts']) {
      const src = readSource(file);
      expect(src, `${file} should call guardLifecycleSend`).toMatch(/guardLifecycleSend/);
    }
  });

  it('win-back.ts contains no fabricated numeric performance claims', () => {
    const src = readSource('win-back.ts');
    expect(src).not.toMatch(/3x faster/i);
    expect(src).not.toMatch(/40% improvement/i);
    expect(src).not.toMatch(/10\+ hours\/week/i);
    expect(src).not.toMatch(/25% (with|retention)/i);
  });

  it('re-engagement.ts contains no fabricated numeric performance claims', () => {
    const src = readSource('re-engagement.ts');
    expect(src).not.toMatch(/25% ?$/m);
    expect(src).not.toMatch(/site speeds improving by 25%/i);
  });

  it('upsellTrigger.ts validates the source audit belongs to the calling tenant', () => {
    const src = readSource('upsellTrigger.ts');
    expect(src).toMatch(/findFirst\(\{\s*where:\s*\{\s*id:\s*auditId,\s*tenantId\s*\}/s);
  });

  it('upsellTrigger.ts checks for an existing upsell proposal before creating one', () => {
    const src = readSource('upsellTrigger.ts');
    expect(src).toMatch(/upsell:true/);
    expect(src).toMatch(/existingUpsell/);
  });

  it('lifecycleSafety.ts reuses Wave 9A outboundSafety primitives (no parallel framework)', () => {
    const src = readFileSync(join(RETENTION_DIR, 'lifecycleSafety.ts'), 'utf-8');
    expect(src).toMatch(/from '@\/lib\/outreach\/outboundSafety'/);
  });

  it('all lifecycle sender paths recheck cancellation immediately before provider dispatch', () => {
    for (const file of ['nps.ts', 'win-back.ts', 're-engagement.ts']) {
      expect(readSource(file), `${file} should recheck cancellation`).toMatch(/recheckLifecycleSend/);
    }
  });

  it('NPS uses an expiring hashed public token and the response route is rate limited', () => {
    const nps = readSource('nps.ts');
    const route = readFileSync(join(RETENTION_DIR, '../../app/api/nps/respond/route.ts'), 'utf-8');
    expect(nps).toMatch(/randomBytes\(32\)/);
    expect(nps).toMatch(/tokenHash/);
    expect(nps).toMatch(/tokenExpiresAt/);
    expect(route).toMatch(/withRateLimit/);
  });

  it('competitor monitoring cannot send ungrounded LLM-generated alerts', () => {
    const src = readSource('competitor-monitor.ts');
    expect(src).toMatch(/NOT_CONFIGURED/);
    expect(src).not.toMatch(/generateWithGemini|sendProposalEmail/);
  });
});
