/**
 * Wave 3 (P1-25): createEvidence() must require a real pointer at runtime, never
 * falling back to a placeholder value. Red-before/green-after: before this wave,
 * `createEvidence({source: 'x'})` (no pointer) silently produced
 * `{pointer: 'unknown', ...}`, a fabricated value that passed every shape check.
 */
import { describe, expect, it } from 'vitest';

import { containsSecretLike, createEvidence, isPlaceholderPointer } from '../types';

describe('createEvidence (P1-25)', () => {
  it('accepts a real URL pointer', () => {
    const e = createEvidence({ pointer: 'https://acme-dental.com/', source: 'html_analysis' });
    expect(e.pointer).toBe('https://acme-dental.com/');
    expect(e.collected_at).toBeTruthy();
    expect(() => new Date(e.collected_at).toISOString()).not.toThrow();
  });

  it('accepts a real provider-record pointer', () => {
    const e = createEvidence({
      pointer: 'https://places.googleapis.com/v1/places/abc123#editorialSummary',
      source: 'places_api_v1',
    });
    expect(e.pointer).toContain('places/abc123');
  });

  it('accepts a real selector/field pointer', () => {
    const e = createEvidence({ pointer: 'header[server]', source: 'html_analysis' });
    expect(e.pointer).toBe('header[server]');
  });

  it('rejects a missing pointer at the type level (compile-time — see the type signature)', () => {
    // @ts-expect-error pointer is required
    expect(() => createEvidence({ source: 'x' })).toThrow();
  });

  it('rejects an empty pointer at runtime', () => {
    expect(() => createEvidence({ pointer: '', source: 'x' })).toThrow(/placeholder/);
  });

  it('rejects a whitespace-only pointer', () => {
    expect(() => createEvidence({ pointer: '   ', source: 'x' })).toThrow(/placeholder/);
  });

  it("rejects the literal 'unknown' — the old fallback value", () => {
    expect(() => createEvidence({ pointer: 'unknown', source: 'x' })).toThrow(/placeholder/);
  });

  it("rejects 'n/a', 'none', and 'placeholder'", () => {
    expect(() => createEvidence({ pointer: 'n/a', source: 'x' })).toThrow();
    expect(() => createEvidence({ pointer: 'none', source: 'x' })).toThrow();
    expect(() => createEvidence({ pointer: 'placeholder', source: 'x' })).toThrow();
  });

  it('rejects a fabricated non-production pointer domain (localhost)', () => {
    expect(() => createEvidence({ pointer: 'http://localhost:3000/page', source: 'x' })).toThrow();
  });

  it('rejects a module-name-only pointer (pointer === source)', () => {
    expect(() => createEvidence({ pointer: 'tech_stack', source: 'tech_stack' })).toThrow();
  });

  it('rejects a secret-looking pointer', () => {
    expect(() =>
      createEvidence({
        pointer: 'https://x.com?key=AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
        source: 'x',
      })
    ).toThrow(/secret/);
  });

  it('rejects a secret-looking value', () => {
    expect(() =>
      createEvidence({
        pointer: 'https://acme.com',
        source: 'x',
        value: 'sk-abcdefghijklmnopqrstuvwxyz',
      })
    ).toThrow(/secret/);
  });

  it('does not fabricate a current timestamp when collected_at is explicitly provided', () => {
    const historical = '2020-01-01T00:00:00.000Z';
    const e = createEvidence({
      pointer: 'https://acme.com',
      source: 'x',
      collected_at: historical,
    });
    expect(e.collected_at).toBe(historical);
  });
});

describe('isPlaceholderPointer', () => {
  it('flags blank/placeholder/loopback-host values', () => {
    expect(isPlaceholderPointer('')).toBe(true);
    expect(isPlaceholderPointer('   ')).toBe(true);
    expect(isPlaceholderPointer('unknown')).toBe(true);
    expect(isPlaceholderPointer('N/A')).toBe(true);
    expect(isPlaceholderPointer('http://localhost:3000/page')).toBe(true);
    expect(isPlaceholderPointer(null)).toBe(true);
  });

  it('does not flag real-looking pointers, including real public example domains actually fetched', () => {
    expect(isPlaceholderPointer('https://acme-dental.com/')).toBe(false);
    expect(isPlaceholderPointer('places/abc123')).toBe(false);
    expect(isPlaceholderPointer('header[x-vercel-id]')).toBe(false);
    // example.com is a real, publicly resolvable domain — a genuine fetch against it
    // is real evidence, not fabrication. Only exact placeholder words/loopback hosts
    // are lexically banned; provenance for domains that were actually checked cannot
    // be judged from the string alone.
    expect(isPlaceholderPointer('https://example.com/')).toBe(false);
  });
});

describe('containsSecretLike', () => {
  it('flags common credential shapes', () => {
    expect(containsSecretLike('AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q')).toBe(true);
    expect(containsSecretLike('sk-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(containsSecretLike('Bearer abcdef123456.ghijkl789012')).toBe(true);
    expect(containsSecretLike('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });

  it('does not flag ordinary text', () => {
    expect(containsSecretLike('Quality Score: 4/10 (Blurry)')).toBe(false);
    expect(containsSecretLike(42)).toBe(false);
  });
});
