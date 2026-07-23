/**
 * FIX-34: Opt-in / Opt-out toggle API for cross-tenant data sharing.
 * Adds a `dataShareOptIn` boolean to the Tenant's settings and exposes a route
 * to toggle it. The anonymization pipeline must check this flag before processing.
 *
 * PATCH /api/tenant/settings/data-sharing
 * Body: { optIn: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRole } from '@/lib/auth/rbac';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { logger } from '@/lib/logger';

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    // Auth: only admin or owner can change data sharing settings
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { optIn: boolean };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (typeof body.optIn !== 'boolean') {
        return NextResponse.json({ error: 'optIn must be a boolean' }, { status: 400 });
    }

    // Get the tenant ID from the session user
    const user = await prisma.user.findUnique({
        where: { email: session.user.email! },
        select: { tenantId: true, role: true },
    });

    if (!user?.tenantId) {
        return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
    }

    if (!['owner', 'admin'].includes(user.role)) {
        return NextResponse.json({ error: 'Only owners and admins can change data sharing settings' }, { status: 403 });
    }

    // Update the dataShareOptIn setting inside the tenant's settings JSON
    const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { settings: true },
    });

    const currentSettings = (tenant?.settings as Record<string, any>) ?? {};
    const updatedSettings = { ...currentSettings, dataShareOptIn: body.optIn };

    await prisma.tenant.update({
        where: { id: user.tenantId },
        data: { settings: updatedSettings },
    });

    logger.info({ tenantId: user.tenantId, dataShareOptIn: body.optIn }, 'Data sharing preference updated');

    return NextResponse.json({
        success: true,
        dataShareOptIn: body.optIn,
        message: body.optIn
            ? 'Cross-tenant data sharing enabled. Your anonymized patterns will contribute to global insights.'
            : 'Cross-tenant data sharing disabled. Your audit data will not be shared.',
    });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email! },
        select: { tenantId: true },
    });

    if (!user?.tenantId) {
        return NextResponse.json({ error: 'User has no tenant' }, { status: 403 });
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { settings: true },
    });

    const settings = (tenant?.settings as Record<string, any>) ?? {};
    const dataShareOptIn = settings.dataShareOptIn ?? true; // Default: opt-in

    return NextResponse.json({ dataShareOptIn });
}
