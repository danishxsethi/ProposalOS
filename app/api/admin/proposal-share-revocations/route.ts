import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withRole } from '@/lib/middleware/withRole';
import {
  inspectProposalShareTokens,
  ProposalShareRevocationConflict,
  revokeProposalShareTokens,
} from '@/lib/proposal/shareTokenRevocation';

const targetSchema = z
  .object({
    tokenFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    proposalId: z.string().min(1).max(128),
    tenantId: z.string().min(1).max(128),
    auditId: z.string().min(1).max(128),
  })
  .strict();

const requestSchema = z
  .object({
    tokens: z
      .array(z.string().uuid())
      .min(1)
      .max(3)
      .refine(
        (tokens) => new Set(tokens).size === tokens.length,
        'Duplicate token targets are not allowed'
      ),
    dryRun: z.boolean().default(true),
    expectedTargets: z.array(targetSchema).max(3).optional(),
    confirmation: z.literal('REVOKE_PUBLIC_PROPOSAL_LINKS').optional(),
  })
  .strict();

async function handlePost(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid revocation request' }, { status: 400 });
  }

  const { tokens, dryRun, expectedTargets, confirmation } = parsed.data;
  try {
    if (dryRun) {
      const targets = await inspectProposalShareTokens(tokens);
      const response = NextResponse.json({ dryRun: true, targets });
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Trace-Id', traceId);
      return response;
    }

    if (!expectedTargets || confirmation !== 'REVOKE_PUBLIC_PROPOSAL_LINKS') {
      return NextResponse.json(
        { error: 'A dry-run target snapshot and explicit confirmation are required' },
        { status: 400 }
      );
    }

    const session = await auth();
    const actorId = (session?.user as { id?: unknown } | undefined)?.id;
    if (typeof actorId !== 'string' || !actorId.trim()) {
      return NextResponse.json(
        { error: 'Authenticated operator identity is required' },
        { status: 403 }
      );
    }

    const targets = await revokeProposalShareTokens({
      tokens,
      expectedTargets,
      actorId,
    });
    const response = NextResponse.json({ dryRun: false, targets });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    if (error instanceof ProposalShareRevocationConflict) {
      return NextResponse.json(
        { error: 'Targets changed or could not be matched; repeat the dry run' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Proposal share revocation failed', traceId },
      { status: 500 }
    );
  }
}

const rateLimitedPost = (req: Request) =>
  withRateLimit({ windowMs: 60 * 1000, max: 10 })(req, () => handlePost(req));

export const POST = withRole('super_admin', rateLimitedPost);
