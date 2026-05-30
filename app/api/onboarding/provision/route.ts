import { NextResponse } from 'next/server';

import { z } from 'zod';

import { RateLimitPresets, withRateLimit } from '@/lib/middleware/rateLimit';
import { validateCsrfRequest } from '@/lib/security/csrf';
import { TenantProvisioningService } from '@/lib/tenant/TenantProvisioningService';

const provisionSchema = z.object({
  orgName: z.string().min(2, 'Organization name must be at least 2 characters'),
  ownerEmail: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  plan: z.string().optional(),
});

async function handleProvision(req: Request) {
  try {
    // 1. CSRF validation
    if (!validateCsrfRequest(req)) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await req.json();
    const result = provisionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.errors },
        { status: 400 }
      );
    }

    const { orgName, ownerEmail, password, plan } = result.data;

    // 3. Provision tenant and owner
    const provisionResult = await TenantProvisioningService.provision({
      orgName,
      ownerEmail,
      password,
      plan,
    });

    return NextResponse.json({
      success: true,
      message: 'Tenant and owner account successfully provisioned',
      tenantId: provisionResult.tenantId,
      userId: provisionResult.userId,
      email: provisionResult.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: message },
      { status: message.includes('already exists') ? 400 : 500 }
    );
  }
}

export async function POST(req: Request) {
  return withRateLimit(RateLimitPresets.auth)(req, () => handleProvision(req));
}
