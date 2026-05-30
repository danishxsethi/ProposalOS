/**
 * lib/security/encryption/types.ts
 *
 * TypeScript types for application-level field encryption and envelope.
 */

export interface EncryptedFieldEnvelope {
  /** Envelope version (currently 1) */
  v: 1;
  /** Encryption algorithm used */
  alg: 'aes-256-gcm';
  /** Key ID used to encrypt this field, matching the keyring */
  kid: string;
  /** Hex-encoded random 12-byte initialization vector */
  iv: string;
  /** Hex-encoded 16-byte authentication tag from GCM mode */
  tag: string;
  /** Hex-encoded ciphertext */
  ciphertext: string;
}

/**
 * Associated Authenticated Data (AAD) context binding.
 * Used during authenticated encryption (AES-GCM) to bind the ciphertext
 * to its logical location, preventing ciphertext transplantation or swapping attacks.
 */
export interface EncryptionContext {
  /** The model name containing this field (e.g. 'Account') */
  model: string;
  /** The field name being encrypted (e.g. 'access_token') */
  field: string;
  /** Optional tenant identifier for multi-tenant isolation binding */
  tenantId?: string | null;
  /** Optional record primary key ID for row-level binding */
  recordId?: string | null;
}
