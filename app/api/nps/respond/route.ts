import { NextResponse } from 'next/server';

import { withRateLimit } from '@/lib/middleware/rateLimit';
import { handleNPSResponseToken } from '@/lib/retention/nps';

const GENERIC_RESPONSE = { accepted: true };

async function handleResponse(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';
  const scoreParam = searchParams.get('score');
  const feedback = searchParams.get('feedback') ?? undefined;
  const score = Number(scoreParam);

  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json(GENERIC_RESPONSE);
  }

  await handleNPSResponseToken(token, score, feedback);
  return NextResponse.json(GENERIC_RESPONSE);
}

const rateLimited = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    endpoint: 'nps-response',
    failClosed: true,
    auditOnBlock: true,
    routeClass: 'public_nps',
  })(req, () => handleResponse(req));

export const GET = rateLimited;
export const POST = rateLimited;
