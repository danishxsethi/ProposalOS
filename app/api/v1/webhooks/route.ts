/**
 * POST /api/v1/webhooks — Register a webhook endpoint
 * GET  /api/v1/webhooks — List registered webhooks
 * Requirements: 9.4
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/platform/api/middleware';
import { registerWebhook, listWebhooks } from '@/lib/platform/api/webhooks';
import type { WebhookEvent } from '@/lib/platform/types';

const VALID_EVENTS: WebhookEvent[] = [
  'audit.completed',
  'audit.failed',
  'proposal.generated',
  'proposal.viewed',
  'email.sent',
  'email.opened',
  'email.clicked',
  'deal.closed',
  'client.created',
];

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.permissions.includes('write') && !auth.permissions.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden', message: 'write permission required' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, events } = body as { url?: string; events?: unknown[] };

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Bad Request', message: 'url is required' }, { status: 400 });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'Bad Request', message: 'events array is required' }, { status: 400 });
  }

  const invalidEvents = events.filter((e) => !VALID_EVENTS.includes(e as WebhookEvent));
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: 'Bad Request', message: `Invalid events: ${invalidEvents.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'url must be a valid URL' }, { status: 400 });
  }

  const webhook = await registerWebhook(auth.tenantId, {
    url,
    events: events as WebhookEvent[],
  });

  return NextResponse.json(webhook, { status: 201 });
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const webhooks = await listWebhooks(auth.tenantId);
  return NextResponse.json({ data: webhooks });
}
