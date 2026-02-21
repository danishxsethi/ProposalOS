import { StateGraph, Annotation } from "@langchain/langgraph";
import { Finding } from '@prisma/client';
import { RawArtifact, getGenerator } from '@/lib/delivery/generators';
import { runValidationPipeline, ValidatedArtifact } from '@/lib/delivery/validationPipeline';
import { packageArtifact, ImplementationPackage } from '@/lib/delivery/packager';
import { assembleBundle, uploadBundle, createBundleRecord } from '@/lib/delivery/bundler';
import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    return {
      bundle: {
        ...state.bundle,
        zipUrl,
        id: bundleRecord.id,
        status: 'ready',
      },
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

export const deliveryGraph = new StateGraph(DeliveryState)
  .addNode("generate_artifact", generate_artifact)
  .addNode("validate_artifact", validate_artifact)
  .addNode("package_artifact", package_artifact)
  .addNode("assemble_bundle", assemble_bundle)
  .addNode("upload_bundle", upload_bundle)
  .addEdge("__start__", "generate_artifact")
  .addEdge("generate_artifact", "validate_artifact")
  .addEdge("validate_artifact", "package_artifact")
  .addEdge("package_artifact", "assemble_bundle")
  .addEdge("assemble_bundle", "upload_bundle")
  .addEdge("upload_bundle", "__end__")
  .compile();
