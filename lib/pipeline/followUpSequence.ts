import { prisma } from '@/lib/prisma';

export async function updatePendingFollowUps(
  leadId: string,
  type: 'FOLLOWUP_COMPETITOR' | 'FOLLOWUP_PROPOSAL' | 'FOLLOWUP_RETRY'
): Promise<void> {
  await prisma.outreachEmail.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { type },
  });
}

export async function pauseFollowUpSequence(leadId: string): Promise<void> {
  await prisma.outreachEmail.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { status: 'SUPPRESSED' },
  });
}

export async function cancelPendingFollowUps(leadId: string): Promise<void> {
  await pauseFollowUpSequence(leadId);
}
