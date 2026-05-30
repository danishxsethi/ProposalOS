/**
 * lib/security/encryption/keyring.ts
 *
 * Centralized key management and keyring provider for envelope encryption.
 */

import { logger } from '@/lib/logger';

export interface KeyProvider {
  getPrimaryKey(): Promise<{ kid: string; key: Buffer }>;
  getKey(kid: string): Promise<Buffer>;
}

/**
 * Validates that a key buffer is exactly 32 bytes (256 bits).
 */
export function isValidAes256Key(key: Buffer): boolean {
  return key.length === 32;
}

export class EnvKeyProvider implements KeyProvider {
  private primaryKeyId: string;
  private primaryKey: Buffer | null = null;
  private previousKeys: Map<string, Buffer> = new Map();

  constructor() {
    const rawPrimaryKey = process.env.FIELD_ENCRYPTION_PRIMARY_KEY;
    const rawKeyId = process.env.FIELD_ENCRYPTION_KEY_ID;
    const rawPreviousKeys = process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS;

    this.primaryKeyId = rawKeyId || 'local-v1';

    const isProd = process.env.NODE_ENV === 'production';

    // 1. Initialize and Validate Primary Key
    if (rawPrimaryKey) {
      try {
        const decoded = Buffer.from(rawPrimaryKey, 'base64');
        if (isValidAes256Key(decoded)) {
          this.primaryKey = decoded;
        } else {
          const errorMsg = `FIELD_ENCRYPTION_PRIMARY_KEY is not a valid 32-byte key (length: ${decoded.length} bytes)`;
          if (isProd) {
            throw new Error(errorMsg);
          }
          logger.warn(`[Keyring] ${errorMsg}. Falling back to dev key.`);
        }
      } catch (err) {
        if (isProd) {
          throw err;
        }
        logger.warn(
          { err },
          '[Keyring] Failed to decode FIELD_ENCRYPTION_PRIMARY_KEY base64. Falling back to dev key.'
        );
      }
    } else {
      const errorMsg = 'FIELD_ENCRYPTION_PRIMARY_KEY environment variable is missing';
      if (isProd) {
        throw new Error(errorMsg);
      }
      logger.warn(`[Keyring] ${errorMsg}. Falling back to dev key.`);
    }

    // 2. Initialize Fallback Key for non-production if needed
    if (!this.primaryKey && !isProd) {
      // Create a deterministic fallback key for local dev and test environments
      const crypto = require('crypto') as typeof import('crypto');
      this.primaryKey = crypto
        .createHash('sha256')
        .update('dev-fallback-key-proposalos-secure-secret')
        .digest();
    }

    // 3. Initialize Previous Keys (for rotation lookups)
    if (rawPreviousKeys) {
      try {
        const parsed = JSON.parse(rawPreviousKeys) as Record<string, string>;
        for (const [kid, keyBase64] of Object.entries(parsed)) {
          const decoded = Buffer.from(keyBase64, 'base64');
          if (isValidAes256Key(decoded)) {
            this.previousKeys.set(kid, decoded);
          } else {
            logger.error(`[Keyring] Rotated key '${kid}' is not a valid 32-byte key.`);
          }
        }
      } catch (err) {
        logger.error(
          { err },
          '[Keyring] Failed to parse FIELD_ENCRYPTION_PREVIOUS_KEYS JSON config.'
        );
      }
    }
  }

  /**
   * Returns the primary key and its ID for encryption.
   */
  async getPrimaryKey(): Promise<{ kid: string; key: Buffer }> {
    if (!this.primaryKey) {
      throw new Error('[Keyring] Keyring fail-closed: Primary encryption key is unavailable.');
    }
    return { kid: this.primaryKeyId, key: this.primaryKey };
  }

  /**
   * Retrieves a decryption key by its ID, supporting legacy rotated keys.
   */
  async getKey(kid: string): Promise<Buffer> {
    if (kid === this.primaryKeyId) {
      if (!this.primaryKey) {
        throw new Error('[Keyring] Keyring fail-closed: Primary encryption key is unavailable.');
      }
      return this.primaryKey;
    }

    const rotatedKey = this.previousKeys.get(kid);
    if (rotatedKey) {
      return rotatedKey;
    }

    throw new Error(`[Keyring] Unknown or revoked Key ID: '${kid}'`);
  }
}

// Export single instance keyring config
let activeKeyProvider: KeyProvider | null = null;

export function getKeyProvider(): KeyProvider {
  if (!activeKeyProvider) {
    activeKeyProvider = new EnvKeyProvider();
  }
  return activeKeyProvider;
}

// Reset helper for tests
export function resetKeyProvider(provider: KeyProvider | null = null): void {
  activeKeyProvider = provider;
}
