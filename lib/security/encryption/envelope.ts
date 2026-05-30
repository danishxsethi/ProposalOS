/**
 * lib/security/encryption/envelope.ts
 *
 * Authenticated envelope encryption helpers using AES-256-GCM.
 */

import { getKeyProvider } from './keyring';

import type { EncryptedFieldEnvelope, EncryptionContext } from './types';

/**
 * Serializes the EncryptionContext canonically to be used as Associated Authenticated Data (AAD).
 */
export function serializeContext(context: EncryptionContext): Buffer {
  const sortedKeys = Object.keys(context).sort() as Array<keyof EncryptionContext>;
  const sortedObj: Record<string, any> = {};
  for (const key of sortedKeys) {
    if (context[key] !== undefined && context[key] !== null) {
      sortedObj[key] = context[key];
    }
  }
  return Buffer.from(JSON.stringify(sortedObj), 'utf8');
}

/**
 * Checks if a value is a serialized EncryptedFieldEnvelope JSON string.
 */
export function isEncryptedField(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('{') || !value.endsWith('}')) return false;

  try {
    const parsed = JSON.parse(value);
    return (
      parsed &&
      parsed.v === 1 &&
      parsed.alg === 'aes-256-gcm' &&
      typeof parsed.kid === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.tag === 'string' &&
      typeof parsed.ciphertext === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Redacts a field by returning "[ENCRYPTED]" representation.
 */
export function redactEncryptedField(): string {
  return '[ENCRYPTED]';
}

/**
 * Encrypts a plaintext string into a serialized JSON envelope with AES-256-GCM and context binding.
 */
export async function encryptField(plaintext: string, context: EncryptionContext): Promise<string> {
  if (!plaintext) return plaintext;

  const keyProvider = getKeyProvider();
  const { kid, key } = await keyProvider.getPrimaryKey();

  const crypto = require('crypto');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Bind AAD context
  const aad = serializeContext(context);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const tag = cipher.getAuthTag();

  const envelope: EncryptedFieldEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    kid,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };

  return JSON.stringify(envelope);
}

/**
 * Decrypts a serialized JSON envelope back to plaintext, validating key, iv, tag, and AAD context.
 * Supports legacy unencrypted values for compatibility during migrations.
 */
export async function decryptField(
  envelopeStr: string,
  context: EncryptionContext
): Promise<string> {
  if (!envelopeStr) return envelopeStr;

  // Compatibility fallback: if not an encrypted field envelope, return as-is
  if (!isEncryptedField(envelopeStr)) {
    return envelopeStr;
  }

  try {
    const crypto = require('crypto');
    const envelope = JSON.parse(envelopeStr) as EncryptedFieldEnvelope;
    const keyProvider = getKeyProvider();
    const key = await keyProvider.getKey(envelope.kid);

    const iv = Buffer.from(envelope.iv, 'hex');
    const tag = Buffer.from(envelope.tag, 'hex');
    const ciphertext = Buffer.from(envelope.ciphertext, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    // Bind AAD context
    const aad = serializeContext(context);
    decipher.setAAD(aad);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    // Fail closed with a descriptive, typed error, hiding raw cryptographic details or secrets
    throw new Error(
      `[DecryptionFailure] Failed to decrypt field '${context.field}' on model '${context.model}'. ` +
        `Ensure key management is correctly configured and the decryption context/AAD is valid.`
    );
  }
}
