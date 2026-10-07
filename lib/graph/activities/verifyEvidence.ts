import { Evidence } from '@/lib/modules/types';

import type { EvidenceSnapshot, Finding as PrismaFinding } from '@prisma/client';

export interface VerifyEvidenceResult {
  findings: Array<PrismaFinding & { unverified?: boolean; stale?: boolean }>;
  staleCount: number;
  invalidCount: number;
}

function snapshotFreshnessBySource(snapshots: EvidenceSnapshot[], maxAgeMs: number, now: number) {
  const freshness = new Map<string, boolean>();
  for (const snapshot of snapshots) {
    const previous = freshness.get(snapshot.module) ?? false;
    const age = now - snapshot.collectedAt.getTime();
    const isFresh = age >= 0 && age <= maxAgeMs;
    freshness.set(snapshot.module, previous || isFresh);
  }
  return freshness;
}

export async function verifyEvidenceActivity(
  findings: PrismaFinding[],
  maxAgeHours = 24,
  snapshots: EvidenceSnapshot[] = []
): Promise<VerifyEvidenceResult> {
  let staleCount = 0;
  let invalidCount = 0;
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const sourceFreshness = snapshotFreshnessBySource(snapshots, maxAgeMs, now);

  const verifiedFindings = findings.map((finding) => {
    const findingEvidence = Array.isArray(finding.evidence) ? (finding.evidence as unknown as Evidence[]) : [];
    let isUnverified = findingEvidence.length === 0;
    let isStale = false;
    let foundFreshSnapshot = false;

    for (const evidence of findingEvidence) {
      if (!evidence || typeof evidence.pointer !== 'string' || !evidence.pointer.trim()) {
        isUnverified = true;
        continue;
      }
      const timestamp = evidence.collected_at ? Date.parse(evidence.collected_at) : Number.NaN;
      if (!Number.isFinite(timestamp)) {
        isUnverified = true;
        continue;
      }
      const age = now - timestamp;
      const fresh = age >= 0 && age <= maxAgeMs;
      foundFreshSnapshot ||= fresh;
      isStale ||= !fresh;
    }

    const moduleHasFreshSnapshot = sourceFreshness.get(finding.module) === true;
    if (snapshots.length > 0 && !moduleHasFreshSnapshot) isStale = true;
    if (isStale) staleCount++;
    if (isUnverified || isStale || (snapshots.length > 0 && !moduleHasFreshSnapshot)) invalidCount++;

    return {
      ...finding,
      unverified: isUnverified || (snapshots.length > 0 && !moduleHasFreshSnapshot),
      stale: isStale || (!foundFreshSnapshot && snapshots.length > 0),
    };
  });

  return { findings: verifiedFindings, staleCount, invalidCount };
}
