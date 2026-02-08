import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import AuditDetailClient from './AuditDetailClient';

interface Props {
    params: Promise<{ id: string }>;
}

export default async function AuditDetailPage({ params }: Props) {
    const { id } = await params;

    const audit = await prisma.audit.findUnique({
        where: { id },
        include: {
            findings: {
                orderBy: { impactScore: 'desc' }
            },
            proposals: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        }
    });

    if (!audit) {
        notFound();
    }

    return <AuditDetailClient audit={audit} />;
}
