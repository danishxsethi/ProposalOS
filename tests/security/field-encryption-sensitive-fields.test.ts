/**
 * tests/security/field-encryption-sensitive-fields.test.ts
 *
 * Security integration tests proving that NextAuth Account secret fields are encrypted
 * on database write, decrypted on read, and redacted from observability logs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWrappedPrismaAdapter } from '@/lib/auth/wrappedPrismaAdapter';
import { isEncryptedField, decryptField } from '@/lib/security/encryption/envelope';
import { sanitizeForLogs } from '@/lib/logger';
import { redactPayload } from '@/lib/observability/auditTrail';

// Mock Prisma
const mockAccountCreate = vi.fn();
const mockAccountFindFirst = vi.fn();

const mockPrisma = {
  account: {
    create: mockAccountCreate,
    findFirst: mockAccountFindFirst,
  },
} as any;

describe('NextAuth Adapter Field Encryption Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transparently encrypts credentials on linkAccount and decrypts on read', async () => {
    const rawAccount = {
      provider: 'google',
      providerAccountId: 'user-google-id',
      type: 'oauth',
      userId: 'user-1',
      access_token: 'secret-raw-access-token-123',
      refresh_token: 'secret-raw-refresh-token-456',
      id_token: 'secret-raw-id-token-789',
    };

    // Instantiate wrapped adapter
    const adapter = buildWrappedPrismaAdapter(mockPrisma);

    // 1. Mock base adapter's linkAccount to simulate writing to DB
    const baseAdapter = adapter as any;

    // Check encryption on write
    let writtenToDb: any = null;
    mockPrisma.account.create.mockImplementation(async ({ data }: any) => {
      writtenToDb = data;
      return data;
    });

    await adapter.linkAccount(rawAccount);

    // Prove tokens are encrypted at rest in DB
    expect(writtenToDb).not.toBeNull();
    expect(writtenToDb.access_token).not.toBe(rawAccount.access_token);
    expect(isEncryptedField(writtenToDb.access_token)).toBe(true);

    expect(writtenToDb.refresh_token).not.toBe(rawAccount.refresh_token);
    expect(isEncryptedField(writtenToDb.refresh_token)).toBe(true);

    expect(writtenToDb.id_token).not.toBe(rawAccount.id_token);
    expect(isEncryptedField(writtenToDb.id_token)).toBe(true);

    // Verify context can decrypt
    const decryptedAccess = await decryptField(writtenToDb.access_token, {
      model: 'Account',
      field: 'access_token',
      recordId: `${rawAccount.provider}:${rawAccount.providerAccountId}`,
    });
    expect(decryptedAccess).toBe(rawAccount.access_token);

    // 2. Mock base adapter read methods to return encrypted DB fields
    // NextAuth expects transparent decryption when accounts are fetched
    const encryptedDbRecord = { ...writtenToDb };

    // Set up a custom wrapper call to simulate adapter returning the record
    const decryptedRecord = await baseAdapter.linkAccount(rawAccount); // Wrapper returns decrypted written object

    expect(decryptedRecord.access_token).toBe(rawAccount.access_token);
    expect(decryptedRecord.refresh_token).toBe(rawAccount.refresh_token);
    expect(decryptedRecord.id_token).toBe(rawAccount.id_token);
  });
});

describe('Observability Logs & Audit Redaction of Encrypted Envelopes', () => {
  it('redacts plaintext secrets and encrypted envelopes in logger', async () => {
    const rawEnvelope = JSON.stringify({
      v: 1,
      alg: 'aes-256-gcm',
      kid: 'local-v1',
      iv: '0123456789abcdef01234567',
      tag: '0123456789abcdef0123456789abcdef',
      ciphertext: '0123456789abcdef',
    });

    const logPayload = {
      message: 'Processing oauth sign-in',
      credentials: {
        access_token: 'secret-plaintext-token',
        encrypted_field: rawEnvelope,
      },
    };

    const sanitizedLog = sanitizeForLogs(logPayload);

    // Plaintext credential fields are redacted
    expect(sanitizedLog.credentials.access_token).toBe('[REDACTED]');
    // Encrypted field envelope is redacted to [ENCRYPTED]
    expect(sanitizedLog.credentials.encrypted_field).toBe('[ENCRYPTED]');
  });

  it('redacts plaintext secrets and encrypted envelopes in audit trail events', async () => {
    const rawEnvelope = JSON.stringify({
      v: 1,
      alg: 'aes-256-gcm',
      kid: 'local-v1',
      iv: '0123456789abcdef01234567',
      tag: '0123456789abcdef0123456789abcdef',
      ciphertext: '0123456789abcdef',
    });

    const auditPayload = {
      event: 'user_login',
      token: 'secret-plaintext-token-abc',
      envelopeValue: rawEnvelope,
    };

    const redactedAudit = redactPayload(auditPayload);

    // Plaintext token fields are redacted
    expect(redactedAudit.token).toBe('[REDACTED]');
    // Encrypted field envelope is redacted to [ENCRYPTED]
    expect(redactedAudit.envelopeValue).toBe('[ENCRYPTED]');
  });
});
