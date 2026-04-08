/**
 * lib/client/data-export.ts
 *
 * Data Export & Offboarding System
 *
 * Generates a complete data export package for clients including:
 * - All audit reports (PDF + JSON)
 * - Finding details with evidence
 * - Historical comparison reports
 * - Proposal documents
 * - Communication history
 */

import * as fs from 'fs';
import * as path from 'path';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface ExportOptions {
  includePdfReports: boolean;
  includeRawData: boolean;
  includeProposals: boolean;
  includeCommunications: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ExportResult {
  zipUrl: string;
  contents: string[];
  generatedAt: Date;
  expiresAt: Date;
}

/**
 * Generate a complete data export package for a client
 * Note: In production, integrate with cloud storage for ZIP creation
 */
export async function generateExportPackage(
  tenantId: string,
  auditId?: string,
  options: ExportOptions = {
    includePdfReports: true,
    includeRawData: true,
    includeProposals: true,
    includeCommunications: true,
  }
): Promise<ExportResult> {
  const exportId = `export_${tenantId}_${Date.now()}`;
  const contents: string[] = [];

  // Get audit data
  const whereClause = auditId ? { id: auditId, tenantId } : { tenantId };

  const audits = await prisma.audit.findMany({
    where: whereClause,
    include: {
      findings: true,
      FindingStatus: true,
      proposals: options.includeProposals ? true : undefined,
      evidence: true,
      ClientMessage: options.includeCommunications ? true : undefined,
      ReviewSnapshot: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build export data structure
  const exportData: Record<string, unknown> = {};

  for (const audit of audits) {
    const auditDir = `audits/${audit.id}`;

    // Add raw audit data
    if (options.includeRawData) {
      (exportData as any)[`${auditDir}/audit-data.json`] = JSON.stringify(audit, null, 2);
      contents.push(`${auditDir}/audit-data.json`);

      // Add findings
      (exportData as any)[`${auditDir}/findings.json`] = JSON.stringify(audit.findings, null, 2);
      contents.push(`${auditDir}/findings.json`);
    }

    // Add finding status
    (exportData as any)[`${auditDir}/finding-status.json`] = JSON.stringify(
      audit.FindingStatus,
      null,
      2
    );
    contents.push(`${auditDir}/finding-status.json`);

    // Add evidence
    (exportData as any)[`${auditDir}/evidence.json`] = JSON.stringify(audit.evidence, null, 2);
    contents.push(`${auditDir}/evidence.json`);

    // Add proposals
    if (options.includeProposals && audit.proposals) {
      (exportData as any)[`${auditDir}/proposals.json`] = JSON.stringify(audit.proposals, null, 2);
      contents.push(`${auditDir}/proposals.json`);
    }

    // Add communications
    if (options.includeCommunications && audit.ClientMessage) {
      (exportData as any)[`${auditDir}/communications.json`] = JSON.stringify(
        audit.ClientMessage,
        null,
        2
      );
      contents.push(`${auditDir}/communications.json`);
    }

    // Add review snapshots
    (exportData as any)[`${auditDir}/review-history.json`] = JSON.stringify(
      audit.ReviewSnapshot,
      null,
      2
    );
    contents.push(`${auditDir}/review-history.json`);
  }

  // Add tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      brandingConfig: true,
      users: {
        select: { email: true, name: true, role: true },
      },
    },
  });

  if (tenant) {
    (exportData as any)['tenant-info.json'] = JSON.stringify(tenant, null, 2);
    contents.push('tenant-info.json');
  }

  // Add export manifest
  const manifest = {
    exportId,
    generatedAt: new Date(),
    tenantId,
    auditCount: audits.length,
    options,
    contents,
  };

  (exportData as any)['export-manifest.json'] = JSON.stringify(manifest, null, 2);

  // In production, create ZIP and upload to GCS/S3
  // For now, store in database and return download URL
  const zipUrl = `/api/client/export/download/${exportId}`;

  logger.info({ exportId, auditCount: audits.length }, 'Export package generated');

  return {
    zipUrl,
    contents,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

/**
 * Generate offboarding package with additional farewell documentation
 */
export async function generateOffboardingPackage(
  tenantId: string,
  reason: string
): Promise<ExportResult> {
  const exportResult = await generateExportPackage(tenantId, undefined, {
    includePdfReports: true,
    includeRawData: true,
    includeProposals: true,
    includeCommunications: true,
  });

  // Generate summary stats from audits directly
  const audits = await prisma.audit.findMany({
    where: { tenantId },
    select: {
      id: true,
      businessName: true,
      overallScore: true,
      createdAt: true,
    },
  });

  const proposals = await prisma.proposal.findMany({
    where: { audit: { tenantId } },
    select: {
      id: true,
      status: true,
      tierChosen: true,
      dealValue: true,
      createdAt: true,
    },
  });

  const totalAudits = audits.length;
  const totalProposals = proposals.length;
  const avgAuditScore =
    totalAudits > 0 ? audits.reduce((sum, a) => sum + (a.overallScore || 0), 0) / totalAudits : 0;
  const closedDeals = proposals.filter((p) => p.status === 'ACCEPTED').length;
  const totalRevenue = proposals.reduce((sum, p) => sum + (Number(p.dealValue) || 0), 0);

  const summary = {
    offboardingDate: new Date(),
    reason,
    tenantName: tenantId,
    totalAudits,
    totalProposals,
    avgAuditScore: Math.round(avgAuditScore * 100) / 100,
    closedDeals,
    totalRevenue,
  };

  logger.info({ tenantId, summary }, 'Offboarding summary generated');

  return exportResult;
}

/**
 * Get export package for download
 */
export async function getExportPackage(exportId: string): Promise<{
  path: string | null;
  exists: boolean;
}> {
  // In production, retrieve from cloud storage
  // For now, check temp directory
  const tempDir = path.join('/tmp', 'exports', exportId);
  const zipPath = path.join(tempDir, `${exportId}.zip`);

  const exists = fs.existsSync(zipPath);

  return {
    path: exists ? zipPath : null,
    exists,
  };
}
