import { OutreachSendingDomain } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const DEFAULT_DAILY_LIMIT = Math.max(
    1,
    Math.min(250, Number(process.env.OUTREACH_DOMAIN_DAILY_LIMIT || 50)),
);

interface ParsedSender {
    domain: string;
    fromEmail: string;
    fromName: string;
}

function utcDayStart(date = new Date()): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseList(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toEmailSender(value: string): ParsedSender | null {
    const fallbackName = process.env.OUTREACH_SENDER_NAME?.trim() || 'ProposalOS';
    const hasAt = value.includes('@');
    const fromEmail = hasAt ? value.toLowerCase() : `hello@${value.toLowerCase()}`;
    const emailMatch = fromEmail.match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!emailMatch) return null;

    return {
        domain: emailMatch[1].toLowerCase(),
        fromEmail,
        fromName: fallbackName,
    };
}

function configuredSenders(): ParsedSender[] {
    const rawSenders = [
        ...parseList(process.env.OUTREACH_SENDING_EMAILS),
        ...parseList(process.env.OUTREACH_SENDING_DOMAINS),
    ];

    const parsed = rawSenders
        .map((value) => toEmailSender(value))
        .filter((value): value is ParsedSender => value !== null);

    const uniq = new Map<string, ParsedSender>();
    for (const sender of parsed) {
        uniq.set(sender.fromEmail, sender);
    }
    return [...uniq.values()];
}

export async function ensureSendingDomains(tenantId: string): Promise<OutreachSendingDomain[]> {
    const configured = configuredSenders();
    if (configured.length === 0) {
        return prisma.outreachSendingDomain.findMany({
            where: { tenantId, isActive: true },
            orderBy: { fromEmail: 'asc' },
        });
    }

    for (const sender of configured) {
        await prisma.outreachSendingDomain.upsert({
            where: {
                tenantId_fromEmail: {
                    tenantId,
                    fromEmail: sender.fromEmail,
                },
            },
            update: {
                domain: sender.domain,
                fromName: sender.fromName,
                dailyLimit: DEFAULT_DAILY_LIMIT,
                isActive: true,
            },
            create: {
                tenantId,
                domain: sender.domain,
                fromEmail: sender.fromEmail,
                fromName: sender.fromName,
                dailyLimit: DEFAULT_DAILY_LIMIT,
                isActive: true,
            },
        });
    }

    return prisma.outreachSendingDomain.findMany({
        where: { tenantId, isActive: true },
        orderBy: { fromEmail: 'asc' },
    });
}

export async function selectDomainForSend(tenantId: string): Promise<{
    domain: OutreachSendingDomain;
    todaysSent: number;
} | null> {
    const domains = await ensureSendingDomains(tenantId);
    if (domains.length === 0) return null;

    const day = utcDayStart();
    const candidates: Array<{ domain: OutreachSendingDomain; todaysSent: number }> = [];

    for (const domain of domains) {
        const stat = await prisma.outreachDomainDailyStat.upsert({
            where: {
                domainId_day: {
                    domainId: domain.id,
                    day,
                },
            },
            update: {},
            create: {
                tenantId,
                domainId: domain.id,
                day,
            },
        });

        if (stat.sentCount < domain.dailyLimit) {
            candidates.push({ domain, todaysSent: stat.sentCount });
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.todaysSent - b.todaysSent);
    return candidates[0];
}

export async function incrementDomainCounter(
    domainId: string,
    tenantId: string,
    counter: 'sentCount' | 'openCount' | 'clickCount' | 'replyCount',
): Promise<void> {
    const day = utcDayStart();
    await prisma.outreachDomainDailyStat.upsert({
        where: {
            domainId_day: {
                domainId,
                day,
            },
        },
        update: {
            [counter]: { increment: 1 },
        },
        create: {
            tenantId,
            domainId,
            day,
            [counter]: 1,
        },
    });
}

