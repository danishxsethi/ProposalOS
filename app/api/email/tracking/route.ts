import { NextResponse } from 'next/server';

import { EmailEventType, logEmailEvent } from '@/lib/email/analytics';
import { logError, logger } from '@/lib/logger';

// 1x1 transparent GIF pixel base64 encoded
const TRANSPARENT_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = searchParams.get('proposalId');
    const stepStr = searchParams.get('step');
    const variant = searchParams.get('variant');
    const eventType = searchParams.get('eventType');
    const redirectUrl = searchParams.get('url');

    if (!proposalId || !stepStr || !variant || !eventType) {
      return new NextResponse('Missing parameters', { status: 400 });
    }

    const step = parseInt(stepStr, 10);

    const validEventTypes: EmailEventType[] = ['open', 'click'];
    if (!validEventTypes.includes(eventType as EmailEventType)) {
      return new NextResponse('Invalid event type', { status: 400 });
    }

    // Log the event asynchronously so we don't block the response
    logEmailEvent(proposalId, step, variant as 'A' | 'B', eventType as EmailEventType)
      .then((success) => {
        if (success) {
          logger.info(
            {
              event: 'email.tracked',
              proposalId,
              step,
              variant,
              eventType,
            },
            `Email event mapped successfully`
          );
        }
      })
      .catch((error) => {
        logError('Error tracking email event asynchronously', error, { proposalId });
      });

    // If it's a click event with a redirect URL, send a 302 redirect
    if (eventType === 'click' && redirectUrl) {
      return NextResponse.redirect(redirectUrl, 302);
    }

    // Otherwise (open event), return the 1x1 pixel
    return new NextResponse(TRANSPARENT_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    logError('Error processing tracking event', error);
    // Always return the pixel even on error so images don't appear broken
    return new NextResponse(TRANSPARENT_PIXEL, {
      status: 200,
      headers: { 'Content-Type': 'image/gif' },
    });
  }
}
