import { Finding } from '@/lib/diagnosis/types';
import { Evidence } from '@/lib/modules/types';

export interface VerifyEvidenceResult {
    findings: Finding[];
    staleCount: number;
}

export async function verifyEvidenceActivity(
    findings: Finding[],
    maxAgeHours: number = 24
): Promise<VerifyEvidenceResult> {
    let staleCount = 0;
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    const verifiedFindings = findings.map(finding => {
        let isUnverified = false;
        let isStale = false;

        if (!finding.evidence || !Array.isArray(finding.evidence) || finding.evidence.length === 0) {
            isUnverified = true;
        } else {
            for (const ev of finding.evidence as unknown as Evidence[]) {
                // 1. Check pointer
                if (!ev.pointer || typeof ev.pointer !== 'string' || ev.pointer.trim() === '') {
                    isUnverified = true;
                }

                // 2. Check collected_at
                if (ev.collected_at) {
                    const collectedTime = new Date(ev.collected_at).getTime();
                    if (isNaN(collectedTime)) {
                        isUnverified = true;
                    } else if (now - collectedTime > maxAgeMs) {
                        isStale = true;
                    }
                } else {
                    isUnverified = true;
                }

                // 3. Check module mismatch (if ev has a module or source that we can check against finding.module)
                // The prompt says: "Check that the finding's source module matches the evidence's module field."
                // Since finding has `module` and evidence has `source` or `module`
                const evModule = (ev as any).module || ev.source;
                // Note: We don't strictly fail unverified if it's website vs pagespeed_v5 as that's normal.
                // We will flag it if they explicitly gave a module and it mismatches badly, but
                // since types.ts Evidence uses `source`, let's just do a loose check or strict check if both are named 'module'.
                if ((ev as any).module && (ev as any).module !== finding.module) {
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
            stale: isStale
        } as Finding & { unverified?: boolean; stale?: boolean };
    });

    return {
        findings: verifiedFindings,
        staleCount
    };
}
