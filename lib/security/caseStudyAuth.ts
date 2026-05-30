import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

export interface CaseStudyAuthResult {
  authorized: boolean;
  tenantId?: string;
  error?:
    | 'NOT_FOUND'
    | 'MISSING_TOKEN'
    | 'INVALID_TOKEN'
    | 'EXPIRED_TOKEN'
    | 'CROSS_TENANT_MISMATCH';
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Token lifetime is 90 days.
export const TOKEN_EXPIRY_DAYS = 90;

/**
 * Validates access to generate or view a case-study/PDF.
 *
 * Scopes checked:
 * 1. Audit existence.
 * 2. If sessionTenantId matches audit.tenantId -> Authorized (Internal Agency User).
 * 3. If token matches a Proposal linked to this audit -> Authorized (Public Share Link).
 * 4. Token validation is tenant-scoped, audit/proposal-scoped, and un-expired.
 */
export async function validateCaseStudyAccess(
  auditId: string,
  token: string | null,
  sessionTenantId?: string | null
): Promise<CaseStudyAuthResult> {
  // 1. Resolve the audit and its owning tenant via a narrow bypass.
  const audit = await runWithTenantBypass('case-study-auth-audit-lookup', () =>
    prisma.audit.findUnique({
      where: { id: auditId },
      select: { id: true, tenantId: true },
    })
  );

  if (!audit) {
    return { authorized: false, error: 'NOT_FOUND' };
  }

  // 2. If the user is logged in as a tenant user, check if they own this audit.
  if (sessionTenantId && sessionTenantId === audit.tenantId) {
    return { authorized: true, tenantId: audit.tenantId };
  }

  // 3. If no session, verify the public share token.
  if (!token) {
    if (sessionTenantId) {
      return { authorized: false, error: 'CROSS_TENANT_MISMATCH' };
    }
    return { authorized: false, error: 'MISSING_TOKEN' };
  }

  // Find proposal(s) associated with this audit and token
  const proposals = await runWithTenantBypass('case-study-auth-token-lookup', () =>
    prisma.proposal.findMany({
      where: {
        auditId,
        webLinkToken: token,
      },
      select: {
        id: true,
        tenantId: true,
        webLinkToken: true,
        createdAt: true,
        status: true,
      },
    })
  );

  if (proposals.length === 0) {
    return { authorized: false, error: 'INVALID_TOKEN' };
  }

  // Find the exact matching proposal (using timing-safe comparison where practical)
  const proposal = proposals.find((p) => timingSafeCompare(p.webLinkToken, token));

  if (!proposal) {
    return { authorized: false, error: 'INVALID_TOKEN' };
  }

  // 4. Verify tenant scoping.
  if (proposal.tenantId !== audit.tenantId) {
    return { authorized: false, error: 'CROSS_TENANT_MISMATCH' };
  }

  // 5. Verify expiration.
  // We consider a token expired if:
  // - The proposal is explicitly REJECTED (revoked/expired).
  // - The proposal was created more than 90 days ago.
  if (proposal.status === 'REJECTED') {
    return { authorized: false, error: 'EXPIRED_TOKEN' };
  }

  const ageMs = Date.now() - proposal.createdAt.getTime();
  const expiryMs = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > expiryMs) {
    return { authorized: false, error: 'EXPIRED_TOKEN' };
  }

  return { authorized: true, tenantId: audit.tenantId };
}
