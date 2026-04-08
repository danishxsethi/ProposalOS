import { Finding } from '@/lib/diagnosis/types';
import { Evidence } from '@/lib/modules/types';

export interface VerifyEvidenceResult {
  findings: Finding[];
  staleCount: number;
}

export interface FindingEvidence {
  pointer?: string;
  collected_at?: string;
  module?: string;
  source?: string;
  url?: string;
  screenshot?: string;
  timestamp?: string;
  rawHtml?: string;
  apiResponse?: Record<string, unknown>;
}

export async function verifyEvidenceActivity(
  findings: Finding[],
  maxAgeHours: number = 24
): Promise<VerifyEvidenceResult> {
  let staleCount = 0;
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  const verifiedFindings = findings.map((finding) => {
    let isUnverified = false;
    let isStale = false;

    if (!finding.evidence || !Array.isArray(finding.evidence) || finding.evidence.length === 0) {
      isUnverified = true;
    } else {
      for (const ev of finding.evidence as unknown as FindingEvidence[]) {
        if (!ev) {
          isUnverified = true;
          continue;
        }

        // 1. Check pointer
        if (!ev.pointer || typeof ev.pointer !== 'string' || ev.pointer.trim() === '') {
          isUnverified = true;
        }

        // 2. Check collected_at or timestamp
        const timeString = ev.collected_at || ev.timestamp;
        if (timeString) {
          const collectedTime = new Date(timeString).getTime();
          if (isNaN(collectedTime)) {
            isUnverified = true;
          } else if (now - collectedTime > maxAgeMs) {
            isStale = true;
          }
        } else {
          isUnverified = true;
        }

        // 3. Check module mismatch
        if (ev.module && ev.module !== finding.module) {
          isUnverified = true;
        }
      }
    }

    if (isStale) {
      staleCount++;
    }

    return {
      ...finding,
      unverified: isUnverified,
      stale: isStale,
    } as Finding & { unverified?: boolean; stale?: boolean };
  });

  return {
    findings: verifiedFindings,
    staleCount,
  };
}
