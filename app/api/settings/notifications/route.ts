/**
 * app/api/settings/notifications/route.ts
 *
 * Notification Preferences API
 * Allows users to manage their notification settings
 *
 * Features:
 * - Auth & tenant scoping
 * - Zod validation
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { z } from 'zod';

import {
  generateTraceId,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

/**
 * Notification preferences schema
 */
const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  frequency: z.enum(['instant', 'daily', 'weekly', 'never']).optional(),
  types: z.record(z.boolean()).optional(),
});

/**
 * Inner handler for GET preferences
 */
async function handleGetPreferences(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();

    if (!session?.user || !('tenantId' in session.user)) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId as string;
    const userId = (session.user as any).id as string;

    // Get existing preferences or create defaults
    let preferences = await prisma.notificationPreference.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await prisma.notificationPreference.create({
        data: {
          tenantId,
          userId,
          emailEnabled: true,
          smsEnabled: false,
          frequency: 'instant',
          types: {
            proposalReady: true,
            proposalViewed: true,
            nps: true,
            upsell: false,
            reEngagement: true,
            scanComplete: true,
          },
        },
      });
    }

    const response = NextResponse.json({
      success: true,
      preferences: {
        emailEnabled: preferences.emailEnabled,
        smsEnabled: preferences.smsEnabled,
        frequency: preferences.frequency,
        types: preferences.types as Record<string, boolean>,
      },
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch notification preferences');
    const internalError = new InternalError('Failed to fetch preferences', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for PUT preferences
 */
async function handleUpdatePreferences(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();

    if (!session?.user || !('tenantId' in session.user)) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId as string;
    const userId = (session.user as any).id as string;
    const body = await req.json();

    // Validate request body
    const result = notificationPreferencesSchema.safeParse(body);
    if (!result.success) {
      const errorDetails = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        new ValidationError('Invalid preferences data', errorDetails).toEnvelope(req.url, traceId),
        { status: 400 }
      );
    }

    const { emailEnabled, smsEnabled, frequency, types } = result.data;

    // Update or create preferences
    const preferences = await prisma.notificationPreference.upsert({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
      update: {
        emailEnabled: emailEnabled ?? undefined,
        smsEnabled: smsEnabled ?? undefined,
        frequency: frequency ?? undefined,
        types: types ?? undefined,
      },
      create: {
        tenantId,
        userId,
        emailEnabled: emailEnabled ?? true,
        smsEnabled: smsEnabled ?? false,
        frequency: frequency ?? 'instant',
        types: types ?? {
          proposalReady: true,
          proposalViewed: true,
          nps: true,
          upsell: false,
          reEngagement: true,
          scanComplete: true,
        },
      },
    });

    logger.info({ userId, tenantId }, 'Notification preferences updated');

    const response = NextResponse.json({
      success: true,
      preferences: {
        emailEnabled: preferences.emailEnabled,
        smsEnabled: preferences.smsEnabled,
        frequency: preferences.frequency,
        types: preferences.types as Record<string, boolean>,
      },
      message: 'Notification preferences saved successfully',
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to update notification preferences');
    const internalError = new InternalError('Failed to update preferences', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

/**
 * Inner handler for DELETE preferences
 */
async function handleDeletePreferences(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const session = await auth();

    if (!session?.user || !('tenantId' in session.user)) {
      return NextResponse.json(
        new UnauthorizedError('Authentication required').toEnvelope(req.url, traceId),
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId as string;
    const userId = (session.user as any).id as string;

    // Delete existing preferences
    await prisma.notificationPreference
      .delete({
        where: {
          tenantId_userId: {
            tenantId,
            userId,
          },
        },
      })
      .catch(() => {
        // Ignore if doesn't exist
      });

    // Create defaults
    const preferences = await prisma.notificationPreference.create({
      data: {
        tenantId,
        userId,
        emailEnabled: true,
        smsEnabled: false,
        frequency: 'instant',
        types: {
          proposalReady: true,
          proposalViewed: true,
          nps: true,
          upsell: false,
          reEngagement: true,
          scanComplete: true,
        },
      },
    });

    logger.info({ userId, tenantId }, 'Notification preferences reset to defaults');

    const response = NextResponse.json({
      success: true,
      preferences: {
        emailEnabled: preferences.emailEnabled,
        smsEnabled: preferences.smsEnabled,
        frequency: preferences.frequency,
        types: preferences.types as Record<string, boolean>,
      },
      message: 'Notification preferences reset to defaults',
    });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to reset notification preferences');
    const internalError = new InternalError('Failed to reset preferences', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedGet = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many preference requests. Please wait before trying again.',
  })(req, () => handleGetPreferences(req));

const rateLimitedPut = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many preference update requests. Please wait before trying again.',
  })(req, () => handleUpdatePreferences(req));

const rateLimitedDelete = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many preference reset requests. Please wait before trying again.',
  })(req, () => handleDeletePreferences(req));

export const GET = rateLimitedGet;
export const PUT = rateLimitedPut;
export const DELETE = rateLimitedDelete;
