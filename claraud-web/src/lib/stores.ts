// Simple in-memory stores for development.
// In production, these will be replaced by Prisma/PostgreSQL.

export const scanStore = new Map<string, {
    token: string;
    url: string;
    businessName?: string;
    callCount: number;
    createdAt: number;
}>();

export const leadStore = new Map<string, {
    email: string;
    businessUrl: string;
    scanToken: string;
    scores: Record<string, number>;
    capturedAt: Date;
}>();