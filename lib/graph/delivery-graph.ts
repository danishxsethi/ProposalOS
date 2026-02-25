import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding, ProjectStatus } from '@prisma/client';
import { RawArtifact, getGenerator } from '@/lib/delivery/generators';
import { runValidationPipeline, ValidatedArtifact } from '@/lib/delivery/validationPipeline';
import { packageArtifact, ImplementationPackage } from '@/lib/delivery/packager';
import { assembleBundle, uploadBundle, createBundleRecord } from '@/lib/delivery/bundler';
import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { runAudit } from '@/lib/audit/runner';
import { generateComparisonReport, ComparisonReportResult } from '@/lib/delivery/comparisonReport';

export interface GeneratedArtifact {
  id: string;
  content: string;
  artifactType: string;
  status: 'pending' | 'validated' | 'failed_validation' | 'packaged';
  validationResults: any[];
  confidenceLevel?: string;
  estimatedImpact?: string;
}

export interface ValidationSummary {
  totalArtifacts: number;
  validatedCount: number;
  failedCount: number;
  rejectionRate: number;
}

export interface ComparisonReport {
  scoreChange: number;
  findingsResolved: number;
  newFindings: number;
  improvements: Array<{ category: string; change: string }>;
  generatedAt: string;
}

export const DeliveryState = Annotation.Root({
  findings: Annotation<Finding[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  proposalSections: Annotation<Record<string, any>>({
    reducer: (x, y) => y,
    default: () => ({})
  }),
  artifacts: Annotation<GeneratedArtifact[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  packages: Annotation<ImplementationPackage[]>({
    reducer: (x, y) => y,
    default: () => []
  }),
  bundle: Annotation<any>({
    reducer: (x, y) => y,
    default: () => null
  }),
  validationSummary: Annotation<ValidationSummary>({
    reducer: (x, y) => y,
    default: () => ({ totalArtifacts: 0, validatedCount: 0, failedCount: 0, rejectionRate: 0 })
  }),
  tenantId: Annotation<string>({ reducer: (x, y) => y }),
  proposalId: Annotation<string>({ reducer: (x, y) => y }),

  // Post-delivery audit fields
  originalAuditId: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
  postDeliveryAuditId: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
  comparisonReport: Annotation<ComparisonReportResult | null>({ reducer: (x, y) => y, default: () => null }),
  improvementScore: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
});

// Nodes

async function generate_artifact(state: typeof DeliveryState.State) {
  const artifacts: GeneratedArtifact[] = [];

  for (const finding of state.findings) {
    try {
      const generator = getGenerator(finding.category);
      if (!generator) {
        console.warn(`No generator found for category: ${finding.category}`);
        continue;
      }

      const rawArtifact = await generator.generate(finding, state.proposalSections);

      artifacts.push({
        id: finding.id,
        content: rawArtifact.content,
        artifactType: rawArtifact.artifactType,
        status: 'pending',
        validationResults: [],
      });
    } catch (error) {
      console.error(`Failed to generate artifact for finding ${finding.id}:`, error);
    }
  }

  return { artifacts };
}

async function validate_artifact(state: typeof DeliveryState.State) {
  const validatedArtifacts: GeneratedArtifact[] = [];
  let validatedCount = 0;
  let failedCount = 0;

  for (const artifact of state.artifacts) {
    try {
      const rawArtifact: RawArtifact = {
        content: artifact.content,
        artifactType: artifact.artifactType,
        metadata: {
          findingId: artifact.id,
          generatedAt: new Date(),
          category: artifact.artifactType,
        },
      };

      const validatedArtifact = await runValidationPipeline(rawArtifact);

      const status = validatedArtifact.status === 'VALIDATED' ? 'validated' : 'failed_validation';
      if (status === 'validated') {
        validatedCount++;
      } else {
        failedCount++;
      }

      validatedArtifacts.push({
        id: artifact.id,
        content: artifact.content,
        artifactType: artifact.artifactType,
        status,
        validationResults: validatedArtifact.validationResults,
      });
    } catch (error) {
      console.error(`Failed to validate artifact ${artifact.id}:`, error);
      failedCount++;
      validatedArtifacts.push({
        ...artifact,
        status: 'failed_validation',
      });
    }
  }

  const totalArtifacts = state.artifacts.length;
  const rejectionRate = totalArtifacts > 0 ? failedCount / totalArtifacts : 0;

  return {
    artifacts: validatedArtifacts,
    validationSummary: {
      totalArtifacts,
      validatedCount,
      failedCount,
      rejectionRate,
    },
  };
}

async function package_artifact(state: typeof DeliveryState.State) {
  const packages: ImplementationPackage[] = [];

  for (const artifact of state.artifacts) {
    if (artifact.status !== 'validated') {
      continue;
    }

    try {
      const finding = state.findings.find(f => f.id === artifact.id);
      if (!finding) {
        continue;
      }

      const validatedArtifact: ValidatedArtifact = {
        content: artifact.content,
        artifactType: artifact.artifactType,
        metadata: {
          findingId: artifact.id,
          generatedAt: new Date(),
          category: artifact.artifactType,
        },
        status: 'VALIDATED',
        validationResults: artifact.validationResults,
      };

      const pkg = await packageArtifact(validatedArtifact, finding, state.proposalSections);
      packages.push(pkg);
    } catch (error) {
      console.error(`Failed to package artifact ${artifact.id}:`, error);
    }
  }

  return { packages };
}

async function assemble_bundle(state: typeof DeliveryState.State) {
  if (state.packages.length === 0) {
    console.warn('No packages to assemble');
    return { bundle: null };
  }

  try {
    const { buffer, readmeContent } = await assembleBundle(
      state.packages,
      state.proposalId,
      state.tenantId
    );

    return {
      bundle: {
        buffer,
        readmeContent,
        artifactCount: state.packages.length,
      },
    };
  } catch (error) {
    console.error('Failed to assemble bundle:', error);
    return { bundle: null };
  }
}

async function upload_bundle(state: typeof DeliveryState.State) {
  if (!state.bundle || !state.bundle.buffer) {
    console.warn('No bundle to upload');
    return { bundle: state.bundle };
  }

  try {
    const zipUrl = await uploadBundle(
      state.bundle.buffer,
      state.proposalId,
      state.tenantId
    );

    // Create bundle record in database
    const bundleRecord = await createBundleRecord(
      state.tenantId,
      state.proposalId,
      zipUrl,
      state.bundle.readmeContent,
      state.bundle.artifactCount
    );

    // Update DeliveryTask with bundle ID
    await prisma.deliveryTask.updateMany({
      where: {
        proposalId: state.proposalId,
        tenantId: state.tenantId,
      },
      data: {
        bundleId: bundleRecord.id,
      },
    });

    // Get original audit ID from proposal
    const proposal = await prisma.proposal.findUnique({
      where: { id: state.proposalId },
      select: { auditId: true }
    });

    return {
      bundle: {
        ...state.bundle,
        zipUrl,
        id: bundleRecord.id,
        status: 'ready',
      },
      originalAuditId: proposal?.auditId || null,
    };
  } catch (error) {
    console.error('Failed to upload bundle:', error);
    return {
      bundle: {
        ...state.bundle,
        status: 'failed',
      },
    };
  }
}

/**
 * Task 1: Real re-audit verification node.
 * Creates a fresh audit record, runs all modules via runAudit(), waits for completion.
 * Computes improvementScore and gates Project status on the < 50% threshold.
 */
async function trigger_reaudit(state: typeof DeliveryState.State) {
  if (!state.originalAuditId) {
    console.warn('[ReAudit] No originalAuditId — skipping re-audit');
    return { postDeliveryAuditId: null, improvementScore: 0 };
  }

  try {
    const originalAudit = await prisma.audit.findUnique({
      where: { id: state.originalAuditId },
      include: { findings: true },
    });

    if (!originalAudit) {
      console.warn('[ReAudit] Original audit not found');
      return { postDeliveryAuditId: null, improvementScore: 0 };
    }

    // 1. Create the re-audit record
    const reAudit = await prisma.audit.create({
      data: {
        businessName: originalAudit.businessName,
        businessCity: originalAudit.businessCity,
        businessUrl: originalAudit.businessUrl,
        businessIndustry: originalAudit.businessIndustry,
        verticalPlaybookId: originalAudit.verticalPlaybookId,
        status: 'QUEUED',
        tenantId: state.tenantId,
      },
    });

    // 2. Actually run the audit (blocks until complete)
    try {
      await runAudit(reAudit.id);
    } catch (e) {
      console.error('[ReAudit] runAudit() failed — continuing with empty re-audit', e);
    }

    // 3. Fetch finished findings
    const finished = await prisma.audit.findUnique({
      where: { id: reAudit.id },
      include: { findings: true },
    });

    const originalCount = originalAudit.findings.length;
    const reAuditCount = finished?.findings.length ?? 0;
    const resolvedCount = Math.max(0, originalCount - reAuditCount);
    const improvementScore =
      originalCount > 0 ? Math.round((resolvedCount / originalCount) * 100) : 100;

    console.log(`[ReAudit] improvementScore=${improvementScore}% (${resolvedCount}/${originalCount} resolved)`);

    // 4. Gate Project status — if < 50% resolved, flag as NEEDS_REVIEW
    if (improvementScore < 50) {
      await (prisma as any).project.updateMany({
        where: { proposalId: state.proposalId },
        data: { status: ProjectStatus.NEEDS_REVIEW },
      });
      console.warn(`[ReAudit] Improvement ${improvementScore}% < 50% — Project flagged as NEEDS_REVIEW`);
    }

    // 5. Wire re-audit ID into DeliveryTask
    await prisma.deliveryTask.updateMany({
      where: { proposalId: state.proposalId, tenantId: state.tenantId },
      data: { verificationAuditId: reAudit.id },
    });

    return { postDeliveryAuditId: reAudit.id, improvementScore };
  } catch (error) {
    console.error('[ReAudit] Unexpected failure', error);
    return { postDeliveryAuditId: null, improvementScore: 0 };
  }
}

/**
 * Task 2: Real comparison report using comparisonReport.ts module.
 */
async function generate_comparison(state: typeof DeliveryState.State) {
  if (!state.originalAuditId || !state.postDeliveryAuditId) {
    console.warn('[Comparison] Missing audit IDs — skipping report generation');
    return { comparisonReport: null };
  }

  try {
    const report = await generateComparisonReport(
      state.originalAuditId,
      state.postDeliveryAuditId,
      state.tenantId
    );

    if (report) {
      await prisma.deliveryTask.updateMany({
        where: { proposalId: state.proposalId, tenantId: state.tenantId },
        data: { beforeAfterComparison: report as any },
      });
      console.log(`[Comparison] Report for ${state.proposalId} — ${report.overallImprovementPercent}% improved`);
    }

    return { comparisonReport: report };
  } catch (error) {
    console.error('[Comparison] Failed to generate comparison report:', error);
    return { comparisonReport: null };
  }
}

export const deliveryGraph = new StateGraph(DeliveryState)
  .addNode("generate_artifact", generate_artifact)
  .addNode("validate_artifact", validate_artifact)
  .addNode("package_artifact", package_artifact)
  .addNode("assemble_bundle", assemble_bundle)
  .addNode("upload_bundle", upload_bundle)
  .addNode("trigger_reaudit", trigger_reaudit)
  .addNode("generate_comparison", generate_comparison)

  .addEdge("__start__", "generate_artifact")
  .addEdge("generate_artifact", "validate_artifact")
  .addEdge("validate_artifact", "package_artifact")
  .addEdge("package_artifact", "assemble_bundle")
  .addEdge("assemble_bundle", "upload_bundle")
  .addEdge("upload_bundle", "trigger_reaudit")
  .addEdge("trigger_reaudit", "generate_comparison")
  .addEdge("generate_comparison", "__end__")
  .compile();

/**
 * Sprint 9: Post-Payment entrypoint triggered by Stripe checkout.session.completed.
 * Loads findings for the proposal, then runs the full delivery pipeline asynchronously.
 */
export async function runDeliveryAgent(proposalId: string, tenantId: string): Promise<void> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { audit: { include: { findings: true } } }
  });

  if (!proposal?.audit?.findings?.length) {
    console.warn(`[DeliveryGraph] No findings for proposalId=${proposalId}. Skipping.`);
    return;
  }

  await deliveryGraph.invoke({
    findings: proposal.audit.findings,
    proposalSections: (proposal.tierGrowth as any) || {},
    artifacts: [],
    packages: [],
    bundle: null,
    validationSummary: { totalArtifacts: 0, validatedCount: 0, failedCount: 0, rejectionRate: 0 },
    tenantId,
    proposalId,
    originalAuditId: proposal.auditId,
    postDeliveryAuditId: null,
    comparisonReport: null,
    improvementScore: 0,
  });
}
