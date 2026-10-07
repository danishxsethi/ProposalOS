import { NextResponse } from 'next/server';

import { z } from 'zod';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { deliverProposalEmail } from '@/lib/outreach/outboundDelivery';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';

interface Params { params: Promise<{ token: string }> }
const Input = z.object({ email: z.string().email().max(254) });

async function handleEmail(request: Request, { params }: Params): Promise<NextResponse> {
  const traceId = generateTraceId();
  try {
    const { token } = await params;
    const input = Input.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: 'A valid recipient email and approval are required' }, { status: 400 });
    const access = await resolvePublicProposalAccess(token);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '';
    const delivery = await deliverProposalEmail({
      tenantId: access.tenantId,
      proposalId: access.proposalId,
      webLinkToken: token,
      recipient: input.data.email,
      from: process.env.FROM_EMAIL ?? 'noreply@proposalengine.app',
      fromName: 'ProposalOS',
      subject: `Proposal for ${access.proposal.audit.businessName}`,
      html: `<p>Your proposal is ready for review.</p><p><a href="${base}/proposal/${encodeURIComponent(token)}">View proposal</a></p><p><a href="${base}/api/proposal/token/${encodeURIComponent(token)}/pdf">Download PDF</a></p>`,
      approved: false,
    });
    if (delivery.state !== 'SENT') return NextResponse.json({ state: delivery.state, reason: delivery.reason }, { status: delivery.state === 'AWAITING_APPROVAL' ? 202 : delivery.state === 'SIMULATED' ? 200 : 409 });
    return NextResponse.json({ success: true, state: delivery.state, sentAt: new Date().toISOString() }, { headers: { 'X-Trace-Id': traceId } });
  } catch (error) {
    if (error instanceof PublicProposalAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(new InternalError('Failed to process email request').toEnvelope(request.url, traceId), { status: 500 });
  }
}

export const POST = (request: Request, params: Params) => withRateLimit({ windowMs: 60_000, max: 3, message: 'Too many email requests' })(request, () => handleEmail(request, params));
