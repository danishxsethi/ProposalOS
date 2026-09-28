import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acceptedCommercialFingerprint } from '@/lib/proposal/publication';

const root = process.cwd();
const webhook = readFileSync(join(root, 'lib/stripe/webhookHandler.ts'), 'utf8');
const webhookRoute = readFileSync(join(root, 'app/api/stripe/webhook/route.ts'), 'utf8');
const checkout = readFileSync(join(root, 'app/api/stripe/checkout-proposal/route.ts'), 'utf8');
const accept = readFileSync(join(root, 'app/api/proposal/token/[token]/accept/route.ts'), 'utf8');
const fulfillmentModel = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');

describe('accepted commercial lifecycle authority', () => {
  it('freezes package, amount, currency and version into the acceptance fingerprint', () => {
    const first = acceptedCommercialFingerprint({ proposalId: 'p1', proposalVersion: 2, tier: 'growth', amountCents: 55000, currency: 'usd', tierContent: { name: 'Growth' } });
    const same = acceptedCommercialFingerprint({ proposalId: 'p1', proposalVersion: 2, tier: 'growth', amountCents: 55000, currency: 'usd', tierContent: { name: 'Growth' } });
    const changed = acceptedCommercialFingerprint({ proposalId: 'p1', proposalVersion: 2, tier: 'growth', amountCents: 56000, currency: 'usd', tierContent: { name: 'Growth' } });
    expect(first).toBe(same);
    expect(first).not.toBe(changed);
  });

  it('requires durable acceptance before checkout and uses the accepted tier price mapping', () => {
    expect(checkout).toContain('prisma.proposalAcceptance.findUnique');
    expect(checkout).toContain('acceptance.tier !== tierId');
    expect(checkout).toContain('commercialFingerprint');
    expect(checkout).toContain('getProposalPriceId(tierId)');
    expect(checkout).not.toContain('IDEMPOTENCY_CACHE');
  });

  it('does not mark provider acceptance as final delivery and uses durable recipient-scoped idempotency', () => {
    const sender = readFileSync(join(root, 'lib/outreach/outboundDelivery.ts'), 'utf8');
    expect(sender).toContain('OUTBOUND_MODE');
    expect(sender).toContain('AWAITING_APPROVAL');
    expect(sender).toContain('SIMULATED');
    expect(sender).toContain('UNKNOWN_PROVIDER_OUTCOME');
    expect(sender).toContain('resolvePublicProposalAccess');
    expect(sender).toContain('emailBlocklist.findUnique');
    expect(sender).toContain('idempotencyKey');
  });

  it('creates durable payment, order, project and operator fulfillment task from verified paid webhook only', () => {
    expect(webhookRoute).toContain('stripe.webhooks.constructEvent');
    expect(webhook).toContain("session.payment_status !== 'paid'");
    expect(webhook).toContain('processedWebhookEvent.createMany');
    expect(webhook).toContain('skipDuplicates: true');
    expect(webhook).toContain('tx.payment.create');
    expect(webhook).toContain('tx.order.upsert');
    expect(webhook).toContain('tx.project.upsert');
    expect(webhook).toContain('tx.fulfillmentTask.upsert');
    expect(webhook).toContain("status: 'AWAITING_OPERATOR'");
    expect(webhook).not.toContain('runDeliveryAgent');
  });

  it('acceptance writes a version-bound commercial snapshot, distinct from payment', () => {
    expect(accept).toContain('proposalVersion: access.proposal.version');
    expect(accept).toContain('commercialSnapshot');
    expect(accept).toContain('commercialFingerprint');
    expect(accept).toContain("status: 'ACCEPTED'");
    expect(accept).not.toContain("status: 'PAID'");
  });

  it('declares tenant-scoped durable Order and operator-owned FulfillmentTask models', () => {
    expect(fulfillmentModel).toMatch(/model Order\s*\{[\s\S]*?tenantId\s+String[\s\S]*?paymentId\s+String[\s\S]*?commercialFingerprint[\s\S]*?\}\s*model FulfillmentTask/);
    expect(fulfillmentModel).toMatch(/model FulfillmentTask\s*\{[\s\S]*?status\s+String\s+@default\("AWAITING_OPERATOR"\)[\s\S]*?executorType\s+String\s+@default\("OPERATOR"\)/);
  });

  it('uses verified Resend webhook delivery events with durable dedupe and suppression', () => {
    const webhookRoute = readFileSync(join(root, 'app/api/outreach/webhook/route.ts'), 'utf8');
    const provider = readFileSync(join(root, 'lib/outreach/providers.ts'), 'utf8');
    expect(webhookRoute).toContain('verifyResendWebhook');
    expect(webhookRoute).toContain('processedOutboundWebhook.createMany');
    expect(webhookRoute).toContain("'BOUNCED'");
    expect(webhookRoute).toContain("'COMPLAINED'");
    expect(webhookRoute).toContain('emailBlocklist.upsert');
    expect(provider).toContain('outreachSendingEnabled');
  });
});
