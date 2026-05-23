/**
 * lib/security/encryption/__tests__/envelope.test.ts
 *
 * Unit tests for envelope encryption and decryption, random IV, AAD binding, and error cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { encryptField, decryptField, isEncryptedField } from '../envelope';
import { EnvKeyProvider, resetKeyProvider } from '../keyring';
import type { EncryptionContext } from '../types';

describe('Envelope Encryption Primitive', () => {
  const testContext: EncryptionContext = {
    model: 'Account',
    field: 'access_token',
    recordId: 'google:12345',
  };

  beforeEach(() => {
    // Reset key provider to standard test/dev environment key
    process.env.NODE_ENV = 'test';
    delete process.env.FIELD_ENCRYPTION_PRIMARY_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY_ID;
    delete process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS;
    resetKeyProvider(null);
  });

  it('performs encrypt/decrypt roundtrip correctly', async () => {
    const plaintext = 'very-sensitive-oauth-access-token';
    const encrypted = await encryptField(plaintext, testContext);

    expect(isEncryptedField(encrypted)).toBe(true);

    const decrypted = await decryptField(encrypted, testContext);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext due to random IV', async () => {
    const plaintext = 'token-123';
    const enc1 = await encryptField(plaintext, testContext);
    const enc2 = await encryptField(plaintext, testContext);

    expect(enc1).not.toBe(enc2);

    const dec1 = await decryptField(enc1, testContext);
    const dec2 = await decryptField(enc2, testContext);

    expect(dec1).toBe(plaintext);
    expect(dec2).toBe(plaintext);
  });

  it('fails decryption if wrong AAD / context is supplied', async () => {
    const plaintext = 'secret-data';
    const encrypted = await encryptField(plaintext, testContext);

    const wrongContext: EncryptionContext = {
      ...testContext,
      field: 'refresh_token', // different field
    };

    await expect(decryptField(encrypted, wrongContext)).rejects.toThrow(/Failed to decrypt field/);
  });

  it('fails decryption if ciphertext is tampered with', async () => {
    const plaintext = 'token-to-tamper';
    const encryptedStr = await encryptField(plaintext, testContext);
    const parsed = JSON.parse(encryptedStr);

    // Tamper with ciphertext by altering last char
    const lastChar = parsed.ciphertext.slice(-1);
    const newLastChar = lastChar === 'a' ? 'b' : 'a';
    parsed.ciphertext = parsed.ciphertext.slice(0, -1) + newLastChar;

    const tamperedEnvelope = JSON.stringify(parsed);

    await expect(decryptField(tamperedEnvelope, testContext)).rejects.toThrow(
      /Failed to decrypt field/
    );
  });

  it('fails decryption if auth tag is tampered with', async () => {
    const plaintext = 'token-to-tamper-tag';
    const encryptedStr = await encryptField(plaintext, testContext);
    const parsed = JSON.parse(encryptedStr);

    // Tamper with tag - ensure we change the first character regardless of what it is
    parsed.tag = parsed.tag[0] === '0' ? '1' + parsed.tag.slice(1) : '0' + parsed.tag.slice(1);

    const tamperedEnvelope = JSON.stringify(parsed);

    await expect(decryptField(tamperedEnvelope, testContext)).rejects.toThrow(
      /Failed to decrypt field/
    );
  });

  it('returns plaintext as compatibility fallback if not encrypted', async () => {
    const rawPlaintext = 'plain-oauth-token';
    const result = await decryptField(rawPlaintext, testContext);
    expect(result).toBe(rawPlaintext);
  });
});
