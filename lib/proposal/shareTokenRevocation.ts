import { createHash } from 'crypto';

import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { runWithPrismaTransactionContext, runWithTenantBypass } from '@/lib/tenant/context';

const MAX_TARGETS = 3;

type ProposalShareTokenRecord = {
  id: string;
  tenantId: string;
  auditId: string;
  status: string;
  createdAt: Date;
  publicAccessRevokedAt: Date | null;
  webLinkToken: string;
};

export interface ProposalShareRevocationTarget {
  tokenFingerprint: string;
  proposalId: string;
  tenantId: string;
  auditId: string;
}

export type ProposalShareRevocationDisposition =
  | 'NOT_REVOKED'
  | 'ALREADY_REVOKED'
  | 'NOT_FOUND'
  | 'REVOKED';

export interface ProposalShareRevocationResult {
  tokenFingerprint: string;
  disposition: ProposalShareRevocationDisposition;
  proposalId: string | null;
  tenantId: string | null;
  auditId: string | null;
  status: string | null;
  createdAt: string | null;
  revokedAt: string | null;
}

export class ProposalShareRevocationConflict extends Error {
  constructor() {
    super('Proposal share revocation targets changed; repeat the dry run.');
    this.name = 'ProposalShareRevocationConflict';
  }
}

function fingerprintToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function validateTokens(tokens: string[]): void {
  if (tokens.length < 1 || tokens.length > MAX_TARGETS || new Set(tokens).size !== tokens.length) {
    throw new ProposalShareRevocationConflict();
  }
}

function selectFields() {
  return {
    id: true,
    tenantId: true,
    auditId: true,
    status: true,
    createdAt: true,
    publicAccessRevokedAt: true,
    webLinkToken: true,
  } as const;
}

function toResult(
  token: string,
  record: ProposalShareTokenRecord | undefined,
  disposition?: ProposalShareRevocationDisposition,
  revokedAt?: Date | null
): ProposalShareRevocationResult {
  return {
    tokenFingerprint: fingerprintToken(token),
    disposition:
      disposition ??
      (record ? (record.publicAccessRevokedAt ? 'ALREADY_REVOKED' : 'NOT_REVOKED') : 'NOT_FOUND'),
    proposalId: record?.id ?? null,
    tenantId: record?.tenantId ?? null,
    auditId: record?.auditId ?? null,
    status: record?.status ?? null,
    createdAt: record?.createdAt.toISOString() ?? null,
    revokedAt: revokedAt?.toISOString() ?? record?.publicAccessRevokedAt?.toISOString() ?? null,
  };
}

function findByToken(records: ProposalShareTokenRecord[], tokens: string[]) {
  const recordsByToken = new Map(records.map((record) => [record.webLinkToken, record]));
  return new Map(tokens.map((token) => [token, recordsByToken.get(token)]));
}

function targetSnapshot(
  recordsByToken: Map<string, ProposalShareTokenRecord | undefined>,
  tokens: string[]
) {
  return tokens.flatMap((token) => {
    const record = recordsByToken.get(token);
    return record
      ? [
          {
            tokenFingerprint: fingerprintToken(token),
            proposalId: record.id,
            tenantId: record.tenantId,
            auditId: record.auditId,
          },
        ]
      : [];
  });
}

function stableSnapshot(targets: ProposalShareRevocationTarget[]): string {
  return JSON.stringify(
    [...targets]
      .map(({ tokenFingerprint, proposalId, tenantId, auditId }) => ({
        tokenFingerprint,
        proposalId,
        tenantId,
        auditId,
      }))
      .sort((left, right) => left.tokenFingerprint.localeCompare(right.tokenFingerprint))
  );
}

/** Read-only lookup for an authenticated operator dry run. Raw share tokens never leave this module. */
export async function inspectProposalShareTokens(
  tokens: string[]
): Promise<ProposalShareRevocationResult[]> {
  validateTokens(tokens);

  return runWithTenantBypass('admin-proposal-share-revocation-dry-run', async () => {
    const records = (await prisma.proposal.findMany({
      where: { webLinkToken: { in: tokens } },
      select: selectFields(),
    })) as ProposalShareTokenRecord[];
    const recordsByToken = findByToken(records, tokens);
    return tokens.map((token) => toResult(token, recordsByToken.get(token)));
  });
}

/**
 * Revokes only records that match the dry-run identity snapshot. The update and
 * audit event share one database transaction; a repeated call is idempotent.
 */
export async function revokeProposalShareTokens(input: {
  tokens: string[];
  expectedTargets: ProposalShareRevocationTarget[];
  actorId: string;
}): Promise<ProposalShareRevocationResult[]> {
  const { tokens, expectedTargets, actorId } = input;
  validateTokens(tokens);
  if (!actorId.trim()) throw new ProposalShareRevocationConflict();

  return runWithTenantBypass('admin-proposal-share-revocation', () =>
    prisma.$transaction(async (tx) => {
      const records = (await prisma.proposal.findMany({
        where: { webLinkToken: { in: tokens } },
        select: selectFields(),
      })) as ProposalShareTokenRecord[];
      const recordsByToken = findByToken(records, tokens);
      const currentTargets = targetSnapshot(recordsByToken, tokens);

      // Require every requested token to resolve and bind the write to exactly the
      // records shown during dry run. This also rejects stale or cross-tenant edits.
      if (
        currentTargets.length !== tokens.length ||
        stableSnapshot(currentTargets) !== stableSnapshot(expectedTargets)
      ) {
        throw new ProposalShareRevocationConflict();
      }

      const transactionTimestamp = new Date();
      const results: ProposalShareRevocationResult[] = [];
      for (const token of tokens) {
        const record = recordsByToken.get(token);
        if (!record) throw new ProposalShareRevocationConflict();
        if (record.publicAccessRevokedAt) {
          results.push(toResult(token, record, 'ALREADY_REVOKED'));
          continue;
        }

        const update = await prisma.proposal.updateMany({
          where: {
            id: record.id,
            tenantId: record.tenantId,
            webLinkToken: token,
            publicAccessRevokedAt: null,
          },
          data: { publicAccessRevokedAt: transactionTimestamp },
        });

        if (update.count !== 1) {
          const latest = await prisma.proposal.findFirst({
            where: { id: record.id, tenantId: record.tenantId, webLinkToken: token },
            select: { publicAccessRevokedAt: true },
          });
          if (latest?.publicAccessRevokedAt) {
            results.push(toResult(token, record, 'ALREADY_REVOKED', latest.publicAccessRevokedAt));
            continue;
          }
          throw new ProposalShareRevocationConflict();
        }

        await runWithPrismaTransactionContext(tx, () =>
          recordAuditTrailEvent({
            eventType: 'proposal.access_revoked',
            tenantId: record.tenantId,
            auditId: record.auditId,
            proposalId: record.id,
            actorId,
            triggerSource: 'authenticated_super_admin',
            payload: {
              reason: 'historical_public_token_exposure',
              publicAccessRevokedAt: transactionTimestamp.toISOString(),
            },
          })
        );
        results.push(toResult(token, record, 'REVOKED', transactionTimestamp));
      }

      return results;
    })
  );
}
