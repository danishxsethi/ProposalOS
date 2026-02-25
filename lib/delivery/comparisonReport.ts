/**
 * lib/delivery/comparisonReport.ts
 *
 * Task 2: Before/After Comparison Report
 *
 * Accepts two audit IDs and produces a structured, module-level diff
 * comparing findings before and after delivery tasks were applied.
 * Also generates an HTML summary suitable for PDF rendering or email.
 */

import { prisma } from '@/lib/prisma';
import { Finding } from '@prisma/client';

export interface ModuleComparison {
    module: string;
    before: Finding[];
    after: Finding[];
    resolved: Finding[];
    newIssues: Finding[];
    improvementPercent: number;
}

export interface ComparisonReportResult {
    originalAuditId: string;
    reAuditId: string;
    overallImprovementPercent: number;
    /** Number of original findings now gone */
    totalResolved: number;
    /** Number of brand-new findings in the re-audit */
    totalNewIssues: number;
    /** Score delta (reAudit.overallScore - original.overallScore) */
    scoreDelta: number;
    modules: ModuleComparison[];
    /** Ready-to-render HTML summary string */
    htmlSummary: string;
    generatedAt: string;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

export async function generateComparisonReport(
    originalAuditId: string,
    reAuditId: string,
    tenantId: string
): Promise<ComparisonReportResult | null> {
    const [original, reAudit] = await Promise.all([
        prisma.audit.findUnique({
            where: { id: originalAuditId },
            include: { findings: true },
        }),
        prisma.audit.findUnique({
            where: { id: reAuditId },
            include: { findings: true },
        }),
    ]);

    if (!original || !reAudit) {
        console.warn(`[ComparisonReport] Could not find one or both audits: ${originalAuditId}, ${reAuditId}`);
        return null;
    }

    const beforeFindings = original.findings;
    const afterFindings = reAudit.findings;

    // Identify resolved / new by title + category fingerprint
    const beforeKeys = new Set(beforeFindings.map(fingerprint));
    const afterKeys = new Set(afterFindings.map(fingerprint));

    const resolved = beforeFindings.filter(f => !afterKeys.has(fingerprint(f)));
    const newIssues = afterFindings.filter(f => !beforeKeys.has(fingerprint(f)));

    const overallImprovementPercent =
        beforeFindings.length > 0
            ? Math.round((resolved.length / beforeFindings.length) * 100)
            : 100;

    const scoreDelta = (reAudit.overallScore ?? 0) - (original.overallScore ?? 0);

    // Module-level breakdown
    const allModules = new Set([
        ...beforeFindings.map(f => f.module ?? 'unknown'),
        ...afterFindings.map(f => f.module ?? 'unknown'),
    ]);

    const modules: ModuleComparison[] = [];
    for (const mod of allModules) {
        const modBefore = beforeFindings.filter(f => (f.module ?? 'unknown') === mod);
        const modAfter = afterFindings.filter(f => (f.module ?? 'unknown') === mod);
        const modBeforeKeys = new Set(modBefore.map(fingerprint));
        const modAfterKeys = new Set(modAfter.map(fingerprint));

        const modResolved = modBefore.filter(f => !modAfterKeys.has(fingerprint(f)));
        const modNew = modAfter.filter(f => !modBeforeKeys.has(fingerprint(f)));
        const modImprovement =
            modBefore.length > 0
                ? Math.round((modResolved.length / modBefore.length) * 100)
                : 100;

        modules.push({
            module: mod,
            before: modBefore,
            after: modAfter,
            resolved: modResolved,
            newIssues: modNew,
            improvementPercent: modImprovement,
        });
    }

    const htmlSummary = renderHtmlSummary(
        original.businessName,
        overallImprovementPercent,
        scoreDelta,
        resolved.length,
        newIssues.length,
        modules
    );

    return {
        originalAuditId,
        reAuditId,
        overallImprovementPercent,
        totalResolved: resolved.length,
        totalNewIssues: newIssues.length,
        scoreDelta,
        modules,
        htmlSummary,
        generatedAt: new Date().toISOString(),
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable key for matching findings across audits by title + category */
function fingerprint(f: Finding): string {
    return `${(f.category ?? '').toLowerCase()}::${(f.title ?? '').toLowerCase().trim()}`;
}

function renderHtmlSummary(
    businessName: string,
    improvement: number,
    scoreDelta: number,
    resolved: number,
    newIssues: number,
    modules: ModuleComparison[]
): string {
    const moduleRows = modules
        .map(
            m => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;text-transform:capitalize">${m.module}</td>
        <td style="padding:8px 12px;text-align:center">${m.before.length}</td>
        <td style="padding:8px 12px;text-align:center">${m.after.length}</td>
        <td style="padding:8px 12px;text-align:center;color:#22c55e">${m.resolved.length}</td>
        <td style="padding:8px 12px;text-align:center;color:${m.newIssues.length > 0 ? '#ef4444' : '#6b7280'}">${m.newIssues.length}</td>
        <td style="padding:8px 12px;text-align:center;font-weight:700;color:${m.improvementPercent >= 50 ? '#22c55e' : '#f59e0b'}">${m.improvementPercent}%</td>
      </tr>`
        )
        .join('');

    const overallColor = improvement >= 50 ? '#22c55e' : improvement >= 25 ? '#f59e0b' : '#ef4444';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Delivery Report — ${businessName}</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h1 style="font-size:28px;margin-bottom:4px">Delivery Impact Report</h1>
  <p style="color:#64748b;margin-top:0">${businessName}</p>

  <div style="display:flex;gap:24px;margin:28px 0">
    <div style="flex:1;background:#f8fafc;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:42px;font-weight:800;color:${overallColor}">${improvement}%</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px">Issues Resolved</div>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:42px;font-weight:800;color:${scoreDelta >= 0 ? '#22c55e' : '#ef4444'}">${scoreDelta >= 0 ? '+' : ''}${scoreDelta}</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px">Score Change</div>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:42px;font-weight:800;color:#22c55e">${resolved}</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px">Fixed Issues</div>
    </div>
    <div style="flex:1;background:#f8fafc;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:42px;font-weight:800;color:${newIssues > 0 ? '#f59e0b' : '#22c55e'}">${newIssues}</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px">New Issues</div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <thead>
      <tr style="background:#1e293b;color:#fff">
        <th style="padding:10px 12px;text-align:left">Module</th>
        <th style="padding:10px 12px;text-align:center">Before</th>
        <th style="padding:10px 12px;text-align:center">After</th>
        <th style="padding:10px 12px;text-align:center">Resolved</th>
        <th style="padding:10px 12px;text-align:center">New</th>
        <th style="padding:10px 12px;text-align:center">Improvement</th>
      </tr>
    </thead>
    <tbody>${moduleRows}</tbody>
  </table>

  <p style="margin-top:32px;font-size:12px;color:#94a3b8">Generated by ProposalOS Delivery Engine · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
</body>
</html>`;
}
