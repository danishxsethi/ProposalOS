import { NextResponse } from 'next/server';

import { z } from 'zod';

import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { validateCsrfRequest } from '@/lib/security/csrf';
import { getTenantId } from '@/lib/tenant/context';

const onboardingStepSchema = z.object({
  step: z.number().int().min(1).max(4),
  payload: z.any().optional(),
});

async function handleOnboardingStep(req: Request) {
  try {
    // 1. CSRF Validation
    if (!validateCsrfRequest(req)) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await req.json();
    const result = onboardingStepSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.errors },
        { status: 400 }
      );
    }

    const { step, payload } = result.data;

    // 3. Get the current tenant ID from context (injected by withAuth)
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized: No tenant context' }, { status: 401 });
    }

    // 4. Fetch existing tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const currentSettings = (tenant.settings as Record<string, any>) || {};
    const updatedSettings = {
      ...currentSettings,
      currentOnboardingStep: step,
      ...(payload
        ? { onboardingStepData: { ...(currentSettings.onboardingStepData || {}), ...payload } }
        : {}),
    };

    // 5. Update settings and optionally completion timestamp
    const isCompleted = step === 4;
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: updatedSettings,
        ...(isCompleted ? { onboardingCompletedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      step: updatedSettings.currentOnboardingStep,
      onboardingCompletedAt: updatedTenant.onboardingCompletedAt,
    });
  } catch (error) {
    logger.error('[API] Onboarding step update error:', error);
    return NextResponse.json({ error: 'Failed to update onboarding step' }, { status: 500 });
  }
}

export const POST = withAuth(handleOnboardingStep);
