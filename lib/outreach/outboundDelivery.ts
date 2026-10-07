import { createHash } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';

import { assertLiveProviderReady, getSendProvider } from './providers';

export type OutboundState = 'DRAFT' | 'AWAITING_APPROVAL' | 'SIMULATED' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED';

export interface ProposalOutboundInput {
  tenantId: string;
  proposalId: string;
  webLinkToken: string;
  recipient: string;
  from: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  mode?: 'disabled' | 'sandbox' | 'live';
  approved?: boolean;
  idempotencyKey?: string;
}

export interface OutboundDeliveryResult {
  state: OutboundState;
  messageId?: string;
  provider?: string;
  reason?: string;
}

export function outboundMode(): 'disabled' | 'sandbox' | 'live' {
  const mode = process.env.OUTBOUND_MODE?.trim().toLowerCase();
  if (mode === 'live' && process.env.OUTBOUND_DELIVERY_ENABLED === 'true' && process.env.OUTREACH_LIVE_SENDING === 'true') return 'live';
  if (mode === 'sandbox' || (process.env.NODE_ENV === 'test' && mode !== 'live')) return 'sandbox';
  return 'disabled';
}

function stableKey(input: Pick<ProposalOutboundInput, 'tenantId' | 'proposalId' | 'recipient' | 'subject'>): string {
  return createHash('sha256').update(`${input.tenantId}\n${input.proposalId}\n${input.recipient.trim().toLowerCase()}\n${input.subject}`).digest('hex');
}

export async function deliverProposalEmail(input: ProposalOutboundInput): Promise<OutboundDeliveryResult> {
  const mode = input.mode ?? outboundMode();
  const idempotencyKey = input.idempotencyKey ?? stableKey(input);
  if (mode === 'disabled') return { state: 'FAILED', reason: 'Outbound delivery is disabled' };
  if (!input.approved) return { state: 'AWAITING_APPROVAL', reason: 'Human approval is required before proposal delivery' };

  const publicAccess = await resolvePublicProposalAccess(input.webLinkToken);
  if (publicAccess.proposalId !== input.proposalId || publicAccess.tenantId !== input.tenantId) {
    throw new PublicProposalAccessError('Proposal public access is unavailable', 404);
  }

  const proposal = await runWithTenantAsync(input.tenantId, () => prisma.proposal.findFirst({
    where: { id: input.proposalId, tenantId: input.tenantId },
    select: { id: true, status: true, publicationFingerprint: true, qaResults: true, webLinkToken: true, prospectEmail: true, outboundEnabled: true },
  }));
  if (!proposal || !['READY', 'SENT', 'VIEWED'].includes(proposal.status)) return { state: 'FAILED', reason: 'Proposal is not publishable' };
  const authorizedRecipient = proposal.prospectEmail || publicAccess.proposal.prospectEmail;
  if (!authorizedRecipient || authorizedRecipient.trim().toLowerCase() !== input.recipient.trim().toLowerCase()) {
    return { state: 'FAILED', reason: 'Recipient is not the proposal-authorized prospect' };
  }
  const blocked = await prisma.emailBlocklist.findUnique({ where: { email: input.recipient.trim().toLowerCase() } });
  if (blocked) {
    return { state: 'SUPPRESSED', reason: 'Recipient is suppressed or unsubscribed' };
  }
  const existing = await runWithTenantAsync(input.tenantId, () => prisma.proposalOutreach.findFirst({ where: { tenantId: input.tenantId, proposalId: proposal.id, idempotencyKey } }));
  if (existing?.sentAt && existing.providerMessageId) return { state: 'SENT', messageId: existing.providerMessageId, provider: existing.providerName ?? undefined };
  if (existing?.errorMessage?.startsWith('UNKNOWN_PROVIDER_OUTCOME')) return { state: 'QUEUED', reason: 'Previous provider send outcome is unknown and requires reconciliation' };
  if (existing?.errorMessage === 'SENDING') {
    return { state: 'QUEUED', reason: 'A previous send attempt is in progress or has an unknown outcome; automatic resend is blocked' };
  }
  if (mode === 'sandbox') return { state: 'SIMULATED', reason: 'Sandbox mode performs no provider send' };

  if (!proposal.outboundEnabled) return { state: 'AWAITING_APPROVAL', reason: 'Proposal outbound delivery has not been enabled by an authorized operator' };
  assertLiveProviderReady();
  if (existing) {
    await runWithTenantAsync(input.tenantId, () => prisma.proposalOutreach.update({
      where: { id: existing.id }, data: { errorMessage: 'SENDING' },
    }));
  } else {
    try {
      await runWithTenantAsync(input.tenantId, () => prisma.proposalOutreach.create({
        data: { proposalId: proposal.id, tenantId: input.tenantId, recipientEmail: input.recipient, emailSubject: input.subject, emailBody: input.html, idempotencyKey, errorMessage: 'SENDING' },
      }));
    } catch {
      return { state: 'QUEUED', reason: 'Another request already owns this idempotency key' };
    }
  }

  const sending = await runWithTenantAsync(input.tenantId, () => prisma.proposalOutreach.findUnique({ where: { idempotencyKey }, select: { sentAt: true, providerMessageId: true, errorMessage: true } }));
  if (sending?.sentAt && sending.providerMessageId) return { state: 'SENT', messageId: sending.providerMessageId };
  if (sending?.errorMessage !== 'SENDING') return { state: 'QUEUED', reason: 'Another worker already claimed the outbound request' };

  try {
    const sent = await getSendProvider().send({
      from: input.from, fromName: input.fromName, replyTo: input.replyTo,
      to: input.recipient.trim().toLowerCase(), subject: input.subject, html: input.html, text: input.text,
      tags: [{ name: 'category', value: 'proposal' }, { name: 'proposal_id', value: input.proposalId }, { name: 'tenant_id', value: input.tenantId }],
    });
    await runWithTenantAsync(input.tenantId, () => prisma.$transaction([
      prisma.proposalOutreach.update({ where: { idempotencyKey }, data: { providerMessageId: sent.messageId, providerName: sent.provider, sentAt: new Date(), errorMessage: null } }),
      prisma.proposal.updateMany({ where: { id: proposal.id, tenantId: input.tenantId, status: { in: ['READY', 'SENT', 'VIEWED'] } }, data: { status: 'SENT', sentAt: new Date(), prospectEmail: input.recipient } }),
    ]));
    return { state: 'SENT', messageId: sent.messageId, provider: sent.provider };
  } catch (error) {
    await runWithTenantAsync(input.tenantId, () => prisma.proposalOutreach.update({ where: { idempotencyKey }, data: { errorMessage: `UNKNOWN_PROVIDER_OUTCOME: ${error instanceof Error ? error.message : 'provider send failed'}` } }));
    throw error;
  }
}
