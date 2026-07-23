import { Prisma, ProspectDiscoveryJob, ProspectEnrichmentProvider, ProspectEnrichmentStatus, ProspectLead, ProspectLeadStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { discoverBusinesses, DiscoverySourceConfig } from './discovery';
import { runEnrichmentWaterfall } from './enrichment';
import { qualifyLead } from './qualification';
import { normalizeVertical } from './config';

export interface JobSeedCity {
    city: string;
    state?: string | null;
    metro?: string | null;
}

export interface EnqueueDiscoveryJobsInput {
    tenantId: string;
    cities: JobSeedCity[];
    verticals: string[];
    painThreshold?: number;
    targetLeads?: number;
    sourceConfig?: Partial<DiscoverySourceConfig>;
}

export interface ProcessJobsOptions {
    limitJobs?: number;
    leadsPerJob?: number;
    qualificationLimit?: number;
    enrichmentLimit?: number;
}

export interface JobProcessSummary {
    jobId: string;
    city: string;
    vertical: string;
    discoveredCount: number;
    qualifiedCount: number;
    enrichedCount: number;
    status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
    error?: string;
}

interface SourceConfigJson {
    googlePlaces: boolean;
    yelp: boolean;
    directories: boolean;
}

const DEFAULT_SOURCE_CONFIG: SourceConfigJson = {
    googlePlaces: true,
    yelp: true,
    directories: true,
};

function normalizeSourceConfig(value: Prisma.JsonValue | null | undefined): SourceConfigJson {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...DEFAULT_SOURCE_CONFIG };
    }

    const record = value as Record<string, unknown>;
    return {
        googlePlaces: typeof record.googlePlaces === 'boolean' ? record.googlePlaces : true,
        yelp: typeof record.yelp === 'boolean' ? record.yelp : true,
        directories: typeof record.directories === 'boolean' ? record.directories : true,
    };
}

function safeFloat(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
}

function safeInt(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.round(value);
}

function nextDay(date = new Date()): Date {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function plusMinutes(minutes: number, date = new Date()): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

async function upsertDiscoveredLead(job: ProspectDiscoveryJob, business: Awaited<ReturnType<typeof discoverBusinesses>>['businesses'][number]): Promise<ProspectLead> {
    return prisma.prospectLead.upsert({
        where: {
            tenantId_source_sourceExternalId: {
                tenantId: job.tenantId,
                source: business.source,
                sourceExternalId: business.sourceExternalId,
            },
        },
        update: {
            discoveryJobId: job.id,
            businessName: business.businessName,
            city: business.city,
            state: business.state ?? null,
            vertical: business.vertical,
            category: business.category ?? null,
            address: business.address ?? null,
            phone: business.phone ?? null,
            website: business.website ?? null,
            rating: safeFloat(business.rating),
            reviewCount: safeInt(business.reviewCount),
            sourceUrl: business.sourceUrl ?? null,
            painThreshold: job.painThreshold,
        },
        create: {
            tenantId: job.tenantId,
            discoveryJobId: job.id,
            source: business.source,
            sourceExternalId: business.sourceExternalId,
            sourceUrl: business.sourceUrl ?? null,
            businessName: business.businessName,
            city: business.city,
            state: business.state ?? null,
            vertical: business.vertical,
            category: business.category ?? null,
            address: business.address ?? null,
            phone: business.phone ?? null,
            website: business.website ?? null,
            rating: safeFloat(business.rating),
            reviewCount: safeInt(business.reviewCount),
            status: ProspectLeadStatus.DISCOVERED,
            painThreshold: job.painThreshold,
        },
    });
}

async function qualifyLeads(job: ProspectDiscoveryJob, limit: number): Promise<number> {
    const leads = await prisma.prospectLead.findMany({
        where: {
            tenantId: job.tenantId,
            discoveryJobId: job.id,
            status: {
                in: [ProspectLeadStatus.DISCOVERED, ProspectLeadStatus.DISQUALIFIED],
            },
        },
        take: limit,
        orderBy: { updatedAt: 'asc' },
    });

    let qualifiedCount = 0;
    for (const lead of leads) {
        const qualification = await qualifyLead(
            {
                businessName: lead.businessName,
                city: lead.city,
                state: lead.state,
                vertical: lead.vertical,
                website: lead.website,
                rating: lead.rating,
                reviewCount: lead.reviewCount,
            },
            job.painThreshold,
        );

        const nextStatus = qualification.qualified
            ? ProspectLeadStatus.ENRICH_PENDING
            : ProspectLeadStatus.DISQUALIFIED;

        await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
                status: nextStatus,
                painScore: qualification.painScore,
                painBreakdown: qualification.breakdown as unknown as Prisma.InputJsonValue,
                topFindings: qualification.topFindings,
                auditSummarySnippet: qualification.summarySnippet,
                qualificationEvidence: qualification.evidence as Prisma.InputJsonValue,
                qualifiedAt: qualification.qualified ? new Date() : null,
                disqualifiedReason: qualification.qualified ? null : `Pain score ${qualification.painScore} below threshold ${job.painThreshold}`,
            },
        });

        if (qualification.qualified) {
            qualifiedCount += 1;
        }
    }

    return qualifiedCount;
}

function toProviderEnum(provider: string): ProspectEnrichmentProvider {
    switch (provider) {
        case 'APOLLO':
            return ProspectEnrichmentProvider.APOLLO;
        case 'HUNTER':
            return ProspectEnrichmentProvider.HUNTER;
        case 'PROXYCURL':
            return ProspectEnrichmentProvider.PROXYCURL;
        case 'CLEARBIT':
        default:
            return ProspectEnrichmentProvider.CLEARBIT;
    }
}

function toStatusEnum(status: string): ProspectEnrichmentStatus {
    switch (status) {
        case 'SUCCESS':
            return ProspectEnrichmentStatus.SUCCESS;
        case 'FAILED':
            return ProspectEnrichmentStatus.FAILED;
        case 'SKIPPED':
        default:
            return ProspectEnrichmentStatus.SKIPPED;
    }
}

async function enrichLeads(job: ProspectDiscoveryJob, limit: number): Promise<number> {
    const leads = await prisma.prospectLead.findMany({
        where: {
            tenantId: job.tenantId,
            discoveryJobId: job.id,
            status: ProspectLeadStatus.ENRICH_PENDING,
        },
        take: limit,
        orderBy: { qualifiedAt: 'asc' },
    });

    let enrichedCount = 0;

    for (const lead of leads) {
        const enrichment = await runEnrichmentWaterfall({
            businessName: lead.businessName,
            website: lead.website,
            city: lead.city,
            state: lead.state,
        });

        for (const run of enrichment.runs) {
            await prisma.prospectEnrichmentRun.create({
                data: {
                    tenantId: lead.tenantId,
                    leadId: lead.id,
                    provider: toProviderEnum(run.provider),
                    status: toStatusEnum(run.status),
                    requestPayload: {},
                    responsePayload: (run.payload ?? {}) as Prisma.InputJsonValue,
                    costCents: run.costCents,
                    errorMessage: run.error ?? null,
                    completedAt: new Date(),
                },
            });
        }

        const hasContact = Boolean(enrichment.contact?.email || enrichment.contact?.name || enrichment.contact?.linkedin);
        const nextStatus = hasContact ? ProspectLeadStatus.ENRICHED : ProspectLeadStatus.ENRICH_FAILED;
        if (hasContact) enrichedCount += 1;

        await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
                status: nextStatus,
                decisionMakerName: enrichment.contact?.name ?? null,
                decisionMakerTitle: enrichment.contact?.title ?? null,
                decisionMakerEmail: enrichment.contact?.email ?? null,
                decisionMakerLinkedin: enrichment.contact?.linkedin ?? null,
                decisionMakerEmailStatus: enrichment.emailVerification.status,
                estimatedCostCents: lead.estimatedCostCents + enrichment.totalCostCents,
                enrichmentState: {
                    runs: enrichment.runs.map((run) => ({
                        provider: run.provider,
                        status: run.status,
                        error: run.error ?? null,
                        costCents: run.costCents,
                    })),
                    emailVerification: enrichment.emailVerification,
                } as unknown as Prisma.InputJsonValue,
            },
        });
    }

    return enrichedCount;
}

async function processOneJob(job: ProspectDiscoveryJob, options: Required<ProcessJobsOptions>): Promise<JobProcessSummary> {
    await prisma.prospectDiscoveryJob.update({
        where: { id: job.id },
        data: {
            status: 'RUNNING',
            startedAt: new Date(),
            runAttempts: { increment: 1 },
            lastError: null,
        },
    });

    try {
        const sourceConfig = normalizeSourceConfig(job.sourceConfig);
        const discovery = await discoverBusinesses({
            city: job.city,
            state: job.state,
            metro: job.metro,
            vertical: job.vertical,
            targetLeadCount: options.leadsPerJob,
            sourceConfig,
        });

        for (const business of discovery.businesses.slice(0, options.leadsPerJob)) {
            await upsertDiscoveredLead(job, business);
        }

        await qualifyLeads(job, options.qualificationLimit);
        await enrichLeads(job, options.enrichmentLimit);

        const [discoveredCount, qualifiedCount, enrichedCount] = await Promise.all([
            prisma.prospectLead.count({
                where: { tenantId: job.tenantId, discoveryJobId: job.id },
            }),
            prisma.prospectLead.count({
                where: {
                    tenantId: job.tenantId,
                    discoveryJobId: job.id,
                    painScore: { gte: job.painThreshold },
                },
            }),
            prisma.prospectLead.count({
                where: {
                    tenantId: job.tenantId,
                    discoveryJobId: job.id,
                    status: ProspectLeadStatus.ENRICHED,
                },
            }),
        ]);

        const status: JobProcessSummary['status'] = discoveredCount > 0 ? 'COMPLETE' : 'PARTIAL';

        await prisma.prospectDiscoveryJob.update({
            where: { id: job.id },
            data: {
                status,
                discoveredCount,
                qualifiedCount,
                enrichedCount,
                completedAt: new Date(),
                nextRunAt: nextDay(),
            },
        });

        return {
            jobId: job.id,
            city: job.city,
            vertical: job.vertical,
            discoveredCount,
            qualifiedCount,
            enrichedCount,
            status,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await prisma.prospectDiscoveryJob.update({
            where: { id: job.id },
            data: {
                status: 'FAILED',
                lastError: message,
                nextRunAt: plusMinutes(30),
            },
        });

        return {
            jobId: job.id,
            city: job.city,
            vertical: job.vertical,
            discoveredCount: 0,
            qualifiedCount: 0,
            enrichedCount: 0,
            status: 'FAILED',
            error: message,
        };
    }
}

export async function enqueueDiscoveryJobs(input: EnqueueDiscoveryJobsInput): Promise<{
    created: string[];
    skipped: Array<{ city: string; state?: string | null; vertical: string }>;
}> {
    const created: string[] = [];
    const skipped: Array<{ city: string; state?: string | null; vertical: string }> = [];
    const threshold = Math.max(0, Math.min(100, Math.round(input.painThreshold ?? 60)));
    const targetLeads = Math.max(25, Math.min(500, Math.round(input.targetLeads ?? 200)));

    const sourceConfig: SourceConfigJson = {
        ...DEFAULT_SOURCE_CONFIG,
        ...(input.sourceConfig ?? {}),
    };

    for (const cityItem of input.cities) {
        const city = cityItem.city.trim();
        const state = cityItem.state?.trim() || null;
        const metro = cityItem.metro?.trim() || null;

        for (const verticalRaw of input.verticals) {
            const vertical = normalizeVertical(verticalRaw);
            const existing = await prisma.prospectDiscoveryJob.findFirst({
                where: {
                    tenantId: input.tenantId,
                    city,
                    state,
                    vertical,
                    status: { in: ['QUEUED', 'RUNNING', 'PARTIAL'] },
                },
                select: { id: true },
            });

            if (existing) {
                skipped.push({ city, state, vertical });
                continue;
            }

            const createdJob = await prisma.prospectDiscoveryJob.create({
                data: {
                    tenantId: input.tenantId,
                    city,
                    state,
                    metro,
                    vertical,
                    targetLeads,
                    painThreshold: threshold,
                    sourceConfig: sourceConfig as unknown as Prisma.InputJsonValue,
                    status: 'QUEUED',
                    nextRunAt: new Date(),
                },
            });
            created.push(createdJob.id);
        }
    }

    logger.info({
        event: 'outreach.jobs.enqueued',
        tenantId: input.tenantId,
        created: created.length,
        skipped: skipped.length,
    }, 'Outreach discovery jobs enqueued');

    return { created, skipped };
}

export async function processDiscoveryJobs(
    tenantId: string,
    options?: ProcessJobsOptions,
): Promise<{
    processedJobs: number;
    totals: {
        discovered: number;
        qualified: number;
        enriched: number;
        failed: number;
    };
    jobs: JobProcessSummary[];
}> {
    const resolved: Required<ProcessJobsOptions> = {
        limitJobs: Math.max(1, Math.min(25, options?.limitJobs ?? 3)),
        leadsPerJob: Math.max(25, Math.min(500, options?.leadsPerJob ?? 200)),
        qualificationLimit: Math.max(10, Math.min(500, options?.qualificationLimit ?? 200)),
        enrichmentLimit: Math.max(5, Math.min(500, options?.enrichmentLimit ?? 150)),
    };

    const jobs = await prisma.prospectDiscoveryJob.findMany({
        where: {
            tenantId,
            status: { in: ['QUEUED', 'PARTIAL', 'FAILED'] },
            nextRunAt: { lte: new Date() },
        },
        take: resolved.limitJobs,
        orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (jobs.length === 0) {
        return {
            processedJobs: 0,
            totals: { discovered: 0, qualified: 0, enriched: 0, failed: 0 },
            jobs: [],
        };
    }

    const summaries: JobProcessSummary[] = [];
    for (const job of jobs) {
        summaries.push(await processOneJob(job, resolved));
    }

    const totals = summaries.reduce(
        (acc, summary) => {
            acc.discovered += summary.discoveredCount;
            acc.qualified += summary.qualifiedCount;
            acc.enriched += summary.enrichedCount;
            if (summary.status === 'FAILED') acc.failed += 1;
            return acc;
        },
        { discovered: 0, qualified: 0, enriched: 0, failed: 0 },
    );

    logger.info({
        event: 'outreach.jobs.processed',
        tenantId,
        processedJobs: summaries.length,
        totals,
    }, 'Outreach discovery jobs processed');

    return {
        processedJobs: summaries.length,
        totals,
        jobs: summaries,
    };
}
