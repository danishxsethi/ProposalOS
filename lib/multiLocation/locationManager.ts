import { prisma } from '@/lib/prisma';

export interface CreateGroupInput {
    tenantId: string;
    groupName: string;
    industry?: string;
    masterUrl?: string; // If all locations allow using same URL
    locations: {
        name: string;
        address?: string;
        city?: string;
        state?: string;
        placeId?: string;
        url?: string; // Individual URL if different
    }[];
}

export async function createLocationGroup(input: CreateGroupInput) {
    // 1. Create Group
    const group = await prisma.locationGroup.create({
        data: {
            tenantId: input.tenantId,
            groupName: input.groupName,
            industry: input.industry,
            parentBusinessUrl: input.masterUrl
        }
    });

    // 2. Create Audit Placeholders & Members
    // In a real flow, we'd trigger the audit queue here.
    // For now, we'll creating pending audits and link them.

    const results = [];

    for (const loc of input.locations) {
        // Create Audit Record
        const audit = await prisma.audit.create({
            data: {
                tenantId: input.tenantId,
                businessName: `${input.groupName} - ${loc.name}`,
                businessUrl: loc.url || input.masterUrl,
                businessCity: loc.city,
                status: 'QUEUED'
            }
        });

        // Link to Group
        await prisma.locationGroupMember.create({
            data: {
                locationGroupId: group.id,
                auditId: audit.id,
                locationName: loc.name,
                address: loc.address,
                city: loc.city,
                state: loc.state,
                placeId: loc.placeId
            }
        });

        results.push(audit.id);
    }

    return { groupId: group.id, auditIds: results };
}

export async function getGroupReport(groupId: string) {
    const group = await prisma.locationGroup.findUnique({
        where: { id: groupId },
        include: {
            members: {
                include: { audit: true }
            }
        }
    });

    if (!group) return null;

    // Aggregate Stats
    const completedMembers = group.members.filter(m => m.audit.status === 'COMPLETE');

    if (completedMembers.length === 0) {
        return {
            groupName: group.groupName,
            status: 'PROCESSING',
            totalLocations: group.members.length,
            completed: 0
        };
    }

    const ratings = completedMembers
        .map(m => m.audit.overallScore || 0)
        .filter(r => r > 0);

    const avgScore = ratings.length > 0
        ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
        : 0;

    // Identify Best/Worst
    const sorted = [...completedMembers].sort((a, b) => (b.audit.overallScore || 0) - (a.audit.overallScore || 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    return {
        groupName: group.groupName,
        totalLocations: group.members.length,
        avgScore,
        bestLocation: {
            name: best.locationName,
            score: best.audit.overallScore
        },
        worstLocation: {
            name: worst.locationName,
            score: worst.audit.overallScore
        },
        members: group.members.map(m => ({
            name: m.locationName,
            score: m.audit.overallScore,
            status: m.audit.status,
            auditId: m.audit.id
        }))
    };
}
