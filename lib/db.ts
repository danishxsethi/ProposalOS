import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
    prisma: any
}

const prismaClient = new PrismaClient().$extends({
    query: {
        $allModels: {
            async $allOperations({ operation, model, args, query }) {
                try {
                    return await query(args);
                } catch (error: any) {
                    const isRLSError =
                        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2004') ||
                        error.message?.includes('row-level security') ||
                        String(error).includes('RLS');

                    if (isRLSError) {
                        fetch(process.env.ALERT_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/alerts', {
                            method: 'POST',
                            body: JSON.stringify({
                                type: 'RLS_VIOLATION_EVENT',
                                model,
                                operation,
                                error: error.message
                            }),
                            headers: { 'Content-Type': 'application/json' }
                        }).catch(() => null);
                    }
                    throw error;
                }
            }
        }
    }
});

export const prisma = globalForPrisma.prisma ?? prismaClient

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
