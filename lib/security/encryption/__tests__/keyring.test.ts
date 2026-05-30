/**
 * lib/security/encryption/__tests__/keyring.test.ts
 *
 * Unit tests for Keyring, EnvKeyProvider, fail-closed production safety, and rotation lookups.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnvKeyProvider, resetKeyProvider } from '../keyring';

describe('Keyring and EnvKeyProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear variables
    delete process.env.FIELD_ENCRYPTION_PRIMARY_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY_ID;
    delete process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS;
    resetKeyProvider(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    resetKeyProvider(null);
  });

  it('fails closed in production if primary key is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FIELD_ENCRYPTION_PRIMARY_KEY;

    expect(() => new EnvKeyProvider()).toThrow(/variable is missing/);
  });

  it('fails closed in production if primary key is invalid (not 32 bytes)', () => {
    process.env.NODE_ENV = 'production';
    // Base64 of 'short-key' which is < 32 bytes
    process.env.FIELD_ENCRYPTION_PRIMARY_KEY = Buffer.from('short-key').toString('base64');

    expect(() => new EnvKeyProvider()).toThrow(/not a valid 32-byte key/);
  });

  it('falls back to a secure deterministic key in development/test if primary key is missing', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.FIELD_ENCRYPTION_PRIMARY_KEY;

    const provider = new EnvKeyProvider();
    const { kid, key } = await provider.getPrimaryKey();

    expect(kid).toBe('local-v1');
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('loads valid base64 primary key correctly', async () => {
    const valid32ByteKey = Buffer.alloc(32, 'a');
    process.env.FIELD_ENCRYPTION_PRIMARY_KEY = valid32ByteKey.toString('base64');
    process.env.FIELD_ENCRYPTION_KEY_ID = 'test-id';

    const provider = new EnvKeyProvider();
    const { kid, key } = await provider.getPrimaryKey();

    expect(kid).toBe('test-id');
    expect(key.toString('base64')).toBe(valid32ByteKey.toString('base64'));
  });

  it('supports rotated keys from FIELD_ENCRYPTION_PREVIOUS_KEYS JSON', async () => {
    const primaryKey = Buffer.alloc(32, 'p');
    const oldKey = Buffer.alloc(32, 'o');

    process.env.FIELD_ENCRYPTION_PRIMARY_KEY = primaryKey.toString('base64');
    process.env.FIELD_ENCRYPTION_KEY_ID = 'v2-key';
    process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({
      'v1-key': oldKey.toString('base64'),
    });

    const provider = new EnvKeyProvider();

    const retrievedPrimary = await provider.getKey('v2-key');
    expect(retrievedPrimary.toString('base64')).toBe(primaryKey.toString('base64'));

    const retrievedOld = await provider.getKey('v1-key');
    expect(retrievedOld.toString('base64')).toBe(oldKey.toString('base64'));
  });

  it('fails if retrieving an unknown rotated key ID', async () => {
    const provider = new EnvKeyProvider();
    await expect(provider.getKey('unknown-v0')).rejects.toThrow(/Unknown or revoked Key ID/);
  });
});
