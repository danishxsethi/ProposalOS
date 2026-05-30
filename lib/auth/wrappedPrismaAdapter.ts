/**
 * lib/auth/wrappedPrismaAdapter.ts
 *
 * NextAuth/Auth.js PrismaAdapter wrapped with the narrow auth-adapter
 * context helper (Task #14).
 *
 * Every adapter method is wrapped so its Prisma calls run under
 * `runWithAuthAdapterContext`, which:
 *   - Validates the model list against the auth identity allow-list.
 *   - Establishes a tenant bypass with the operation name as reason.
 *   - Logs the invocation with structured metadata.
 *
 * The Credentials provider's pre-tenant `prisma.user.findUnique({ email })`
 * call is NOT wrapped here (it lives in `lib/auth.ts`) — that callsite uses
 * `runWithAuthAdapterContext` directly.
 *
 * If NextAuth adds new adapter methods in a future major release, the new
 * methods will fall through to the underlying adapter and will throw
 * MissingTenantError on first call — which is the desired safe behaviour
 * (you cannot accidentally widen the bypass surface).
 */

import { PrismaAdapter } from '@auth/prisma-adapter';

import { type AuthAdapterModel, runWithAuthAdapterContext } from '@/lib/auth/adapterContext';
import { decryptField, encryptField } from '@/lib/security/encryption/envelope';

import type { PrismaClient } from '@prisma/client';
import type { Adapter } from 'next-auth/adapters';

// ─── Account Encryption Helpers ───────────────────────────────────────────────

const ACCOUNT_SECRET_FIELDS = ['access_token', 'refresh_token', 'id_token'] as const;

/**
 * Transparently encrypts sensitive fields in an Account object before database write.
 */
export async function encryptAccount<T extends Record<string, any>>(account: T): Promise<T> {
  if (!account) return account;
  const encrypted = { ...account } as Record<string, any>;
  const recordId = `${account.provider}:${account.providerAccountId}`;

  for (const field of ACCOUNT_SECRET_FIELDS) {
    if (typeof encrypted[field] === 'string' && encrypted[field]) {
      encrypted[field] = (await encryptField(encrypted[field], {
        model: 'Account',
        field,
        recordId,
      })) as any;
    }
  }
  return encrypted as T;
}

/**
 * Transparently decrypts sensitive fields in an Account object after database read.
 */
export async function decryptAccount<T extends Record<string, any>>(account: T): Promise<T> {
  if (!account) return account;
  const decrypted = { ...account } as Record<string, any>;
  const recordId = `${account.provider}:${account.providerAccountId}`;

  for (const field of ACCOUNT_SECRET_FIELDS) {
    if (typeof decrypted[field] === 'string' && decrypted[field]) {
      decrypted[field] = (await decryptField(decrypted[field], {
        model: 'Account',
        field,
        recordId,
      })) as any;
    }
  }
  return decrypted as T;
}

// ─── Per-method model registry ────────────────────────────────────────────────

/**
 * Static map of NextAuth adapter method → models the method will read/write.
 * This is the auth-adapter allow-list as enforced *per-operation*.
 */
const ADAPTER_METHOD_MODELS: Record<string, AuthAdapterModel[]> = {
  createUser: ['User'],
  getUser: ['User'],
  getUserByEmail: ['User'],
  getUserByAccount: ['User', 'Account'],
  updateUser: ['User'],
  deleteUser: ['User', 'Account', 'Session'],
  linkAccount: ['Account'],
  unlinkAccount: ['Account'],
  createSession: ['Session'],
  getSessionAndUser: ['Session', 'User'],
  updateSession: ['Session'],
  deleteSession: ['Session'],
  createVerificationToken: ['VerificationToken'],
  useVerificationToken: ['VerificationToken'],
};

// ─── Wrapper ──────────────────────────────────────────────────────────────────

/**
 * Build a NextAuth Adapter that runs every method under the narrow
 * auth-adapter bypass context, with transparent AES-256-GCM field encryption.
 */
export function buildWrappedPrismaAdapter(prisma: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(prisma) as Record<string, unknown>;
  const wrapped: Record<string, unknown> = {};

  for (const [methodName, originalImpl] of Object.entries(baseAdapter)) {
    if (typeof originalImpl !== 'function') {
      // Pass through any non-function fields untouched.
      wrapped[methodName] = originalImpl;
      continue;
    }

    const models = ADAPTER_METHOD_MODELS[methodName];

    if (!models) {
      // Unknown adapter method — do NOT silently widen bypass.  Forward the
      // raw method so it falls through to the underlying adapter.  If
      // NextAuth ever calls it without tenant context the standard
      // MissingTenantError will fire, which is the safe default.
      wrapped[methodName] = originalImpl;
      continue;
    }

    wrapped[methodName] = (...args: unknown[]) =>
      runWithAuthAdapterContext({ operation: methodName, models }, async () => {
        // Intercept writes to encrypt Account fields
        let finalArgs = args;
        if (methodName === 'linkAccount' && args[0] && typeof args[0] === 'object') {
          const encryptedAccount = await encryptAccount(args[0] as Record<string, any>);
          finalArgs = [encryptedAccount];
        }

        const result = await (originalImpl as (...a: unknown[]) => Promise<unknown>)(...finalArgs);

        // Intercept reads to decrypt Account fields
        if (result && typeof result === 'object') {
          if ('provider' in result && 'providerAccountId' in result) {
            return decryptAccount(result as Record<string, any>);
          }
        }

        return result;
      });
  }

  return wrapped as Adapter;
}
