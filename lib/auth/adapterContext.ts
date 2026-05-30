/**
 * lib/auth/adapterContext.ts
 *
 * Narrow guarded auth-adapter context helper (Task #14).
 *
 * Why this exists:
 *   NextAuth's PrismaAdapter and our Credentials provider need to read/write
 *   auth identity tables (User, Account, Session, VerificationToken) BEFORE
 *   any tenant context is established (e.g. during `signIn`, OAuth callback,
 *   email verification).  Our standard Prisma extension throws
 *   `MissingTenantError` whenever a tenant-scoped query runs without a
 *   tenant in AsyncLocalStorage, so these legitimate auth flows would
 *   otherwise be blocked.
 *
 *   The fix is NOT a broad `runWithTenantBypass` around arbitrary code.
 *   Instead, this helper:
 *     - Accepts ONLY a fixed allow-list of auth-identity model names.
 *     - Throws synchronously if any other model is requested.
 *     - Logs every invocation with structured metadata for audit trail.
 *     - Wraps `runWithTenantBypass` internally with a stable reason.
 *
 *   This keeps the bypass surface tiny, auditable, and impossible to abuse
 *   for cross-tenant business-data reads.
 *
 * What this helper MUST NOT be used for:
 *   - Audit, Proposal, Finding, EvidenceSnapshot, ProspectLead, … (any
 *     business model)
 *   - Any tenant-scoped business logic
 *   - Bulk operations across tenants
 *
 * If a future caller needs cross-tenant reads, they must write a separate,
 * named helper with its own allow-list — not extend this one.
 */

import { logger } from '@/lib/logger';
import { runWithTenantBypass } from '@/lib/tenant/context';

// ─── Allow-list ───────────────────────────────────────────────────────────────

/**
 * The complete set of auth-identity Prisma model names.  Every entry must be
 * a NextAuth/Auth.js identity-layer model that is genuinely global (no
 * tenant scoping) or that requires pre-tenant lookup (User by email).
 *
 * This list is intentionally small and exhaustive.  Adding a model here
 * widens the auth-bypass surface and requires a security review.
 */
export const AUTH_ADAPTER_ALLOWED_MODELS = Object.freeze([
  'User',
  'Account',
  'Session',
  'VerificationToken',
] as const);

export type AuthAdapterModel = (typeof AUTH_ADAPTER_ALLOWED_MODELS)[number];

const ALLOWED_SET = new Set<string>(AUTH_ADAPTER_ALLOWED_MODELS);

// ─── Errors ──────────────────────────────────────────────────────────────────

export class AuthAdapterModelNotAllowedError extends Error {
  readonly attemptedModel: string;
  constructor(model: string) {
    super(
      `Auth adapter context refused: '${model}' is not in the auth identity allow-list ` +
        `(${AUTH_ADAPTER_ALLOWED_MODELS.join(', ')}). ` +
        `Auth bypass cannot be used for business models.`
    );
    this.name = 'AuthAdapterModelNotAllowedError';
    this.attemptedModel = model;
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export interface AuthAdapterContextOptions {
  /** Stable identifier for the auth operation (e.g. 'getUserByEmail'). */
  operation: string;
  /**
   * The Prisma model(s) this operation will touch.  Every entry must appear
   * in AUTH_ADAPTER_ALLOWED_MODELS or the call is refused before fn runs.
   */
  models: AuthAdapterModel[];
}

/**
 * Run a function under an auth-adapter bypass context.
 *
 * The function is executed inside `runWithTenantBypass` with a stable
 * 'auth-adapter' reason.  The model allow-list is checked synchronously
 * before the bypass is established — invalid model names short-circuit
 * with `AuthAdapterModelNotAllowedError` and never grant bypass.
 *
 * Every invocation is logged with `event: 'auth_adapter.bypass'`.
 */
export async function runWithAuthAdapterContext<T>(
  options: AuthAdapterContextOptions,
  fn: () => Promise<T>
): Promise<T> {
  if (!options.models || options.models.length === 0) {
    throw new AuthAdapterModelNotAllowedError('<empty>');
  }

  for (const model of options.models) {
    if (!ALLOWED_SET.has(model)) {
      logger.error(
        {
          event: 'auth_adapter.disallowed_model',
          operation: options.operation,
          attemptedModel: model,
        },
        'Auth adapter: refused — model not in allow-list'
      );
      throw new AuthAdapterModelNotAllowedError(model);
    }
  }

  logger.info(
    {
      event: 'auth_adapter.bypass',
      operation: options.operation,
      models: options.models,
    },
    'Auth adapter: entering bypass context'
  );

  return runWithTenantBypass(`auth-adapter:${options.operation}`, fn);
}

/**
 * Type guard helper for callers that want to validate model names from
 * untrusted sources (e.g. dynamic routing).
 */
export function isAuthAdapterModel(model: string): model is AuthAdapterModel {
  return ALLOWED_SET.has(model);
}
