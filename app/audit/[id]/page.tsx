import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import AuditStatusClient from './AuditStatusClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function AuditStatusPage({ params }: PageProps) {
    const { id } = await params;

    const audit = await prisma.audit.findUnique({
        where: { id },
        include: {
            findings: {
                where: { excluded: false },
                orderBy: { impactScore: 'desc' },
            },
            proposals: {
                orderBy: { version: 'desc' },
                take: 1,
            },
        },
    });

    if (!audit) {
        notFound();
    }

    return <AuditStatusClient audit={audit} />;
}
