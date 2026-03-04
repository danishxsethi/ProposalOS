import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/middleware/rateLimit';

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    companyName: z.string().min(2),
});

// 10 registration attempts per 15 minutes per IP
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 10 });

export async function POST(request: Request) {
    const { allowed, retryAfter } = authLimiter(request);
    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many attempts. Try again later.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }
    try {
        const body = await request.json();
        const { name, email, password, companyName } = registerSchema.parse(body);

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'User already exists' },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Tenant and User in transaction
        // Ideally we use a transaction but User depends on Tenant ID and Tenant creation is atomic
        // We will create Tenant first
        // Or cleaner: use nested create connection if possible, but User needs to point to Tenant
        // Let's create Tenant first.

        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.create({
                data: {
                    name: companyName,
                    planTier: 'free', // Default to free or trial
                    status: 'trial',
                },
            });

            const user = await tx.user.create({
                data: {
                    name,
                    email,
                    passwordHash: hashedPassword,
                    role: 'owner',
                    tenantId: tenant.id,
                },
            });

            return { user, tenant };
        });

        return NextResponse.json({
            user: {
                id: result.user.id,
                name: result.user.name,
                email: result.user.email,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return NextResponse.json(
            { error: 'Something went wrong' },
            { status: 500 }
        );
    }
}
