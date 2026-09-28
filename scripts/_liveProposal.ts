import { prisma } from '@/lib/prisma';
import { compileAndPersistProposal } from '@/lib/proposal/compiler';
import { runWithTenantBypass, runWithTenantAsync } from '@/lib/tenant/context';
async function main() {
  const auditId = process.argv[2];
  const audit = await runWithTenantBypass('proposal-qa', () => prisma.audit.findUnique({ where: { id: auditId } }));
  if (!audit) throw new Error('audit not found');
  const r = await runWithTenantAsync(audit!.tenantId, () => compileAndPersistProposal({ auditId: audit!.id, tenantId: audit!.tenantId }));
  console.log(JSON.stringify({ id: r.proposalRecord.id, version: r.proposalRecord.version, status: r.proposalRecord.status, qaStatus: r.evaluation?.autoQAStatus?.status, passed: r.evaluation?.passed, overallScore: r.evaluation?.overallScore, token: (r.proposalRecord as unknown as { webLinkToken?: string }).webLinkToken, pricing: (r.proposalRecord as unknown as { pricing?: unknown }).pricing }, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error((e as Error).stack || e); process.exit(1); });
