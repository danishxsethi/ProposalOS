import archiver from 'archiver';
import { Readable } from 'stream';
import { ImplementationPackage } from './packager';
import { prisma } from '@/lib/prisma';
import { uploadToGCS } from '@/lib/storage';

export interface DeliveryBundle {
  id: string;
  tenantId: string;
  proposalId: string;
  zipUrl?: string;
  readmeContent?: string;
  artifactCount: number;
  status: 'assembling' | 'ready' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Assemble packages into a ZIP bundle
 */
export async function assembleBundle(
  packages: ImplementationPackage[],
  proposalId: string,
  tenantId: string
): Promise<{ buffer: Buffer; readmeContent: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });

    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const readmeContent = generateReadme(packages);
      resolve({ buffer, readmeContent });
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Add README
    const readmeContent = generateReadme(packages);
    archive.append(readmeContent, { name: 'README.md' });

    // Add each package
    packages.forEach((pkg, index) => {
      const folderName = `artifact-${index + 1}-${pkg.artifactType}`;

      // Add artifact content
      archive.append(pkg.artifactContent, {
        name: `${folderName}/artifact.${getFileExtension(pkg.artifactType)}`,
      });

      // Add installation instructions
      archive.append(pkg.installationInstructions, {
        name: `${folderName}/INSTALLATION.md`,
      });

      // Add before/after preview if available
      if (pkg.beforePreview || pkg.afterPreview) {
        const preview = `# Before/After Preview\n\n${pkg.beforePreview || ''}\n\n${pkg.afterPreview || ''}`;
        archive.append(preview, {
          name: `${folderName}/PREVIEW.md`,
        });
      }

      // Add WordPress plugin if available
      if (pkg.wordpressPlugin) {
        archive.append(pkg.wordpressPlugin, {
          name: `${folderName}/plugin.php`,
        });
      }

      // Add metadata
      const metadata = {
        artifactId: pkg.artifactId,
        findingId: pkg.findingId,
        artifactType: pkg.artifactType,
        estimatedImpact: pkg.estimatedImpact,
        generatedAt: new Date().toISOString(),
      };
      archive.append(JSON.stringify(metadata, null, 2), {
        name: `${folderName}/metadata.json`,
      });
    });

    archive.finalize();
  });
}

/**
 * Upload bundle to GCS
 */
export async function uploadBundle(
  buffer: Buffer,
  proposalId: string,
  tenantId: string
): Promise<string> {
  const fileName = `delivery-bundles/${tenantId}/${proposalId}-${Date.now()}.zip`;

  try {
    const url = await uploadToGCS(buffer, fileName, 'application/zip');
    return url;
  } catch (error) {
    console.error('Failed to upload bundle to GCS:', error);
    throw error;
  }
}

/**
 * Generate README content for the bundle
 */
export function generateReadme(packages: ImplementationPackage[]): string {
  const lines: string[] = [
    '# Delivery Bundle',
    '',
    'This bundle contains all the artifacts and implementation instructions for your proposal.',
    '',
    '## Contents',
    '',
  ];

  packages.forEach((pkg, index) => {
    lines.push(`### ${index + 1}. ${pkg.artifactType.toUpperCase()}`);
    lines.push(`- **Finding ID:** ${pkg.findingId}`);
    lines.push(`- **Estimated Impact:** ${pkg.estimatedImpact}`);
    lines.push(`- **Type:** ${pkg.artifactType}`);
    lines.push('');
  });

  lines.push('## Installation Instructions');
  lines.push('');
  lines.push('Each artifact folder contains:');
  lines.push('- `artifact.*` - The generated artifact file');
  lines.push('- `INSTALLATION.md` - Step-by-step installation guide');
  lines.push('- `PREVIEW.md` - Before/after preview');
  lines.push('- `plugin.php` - WordPress plugin (if applicable)');
  lines.push('- `metadata.json` - Artifact metadata');
  lines.push('');

  lines.push('## Getting Started');
  lines.push('');
  lines.push('1. Extract this ZIP file');
  lines.push('2. Review the README.md in each artifact folder');
  lines.push('3. Follow the INSTALLATION.md instructions');
  lines.push('4. For WordPress sites, you can install the plugin.php directly');
  lines.push('');

  lines.push('## Support');
  lines.push('');
  lines.push('If you have any questions or need assistance, please contact your account manager.');
  lines.push('');

  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.join('\n');
}

/**
 * Get file extension for artifact type
 */
function getFileExtension(artifactType: string): string {
  switch (artifactType) {
    case 'json_ld':
      return 'json';
    case 'html_meta':
      return 'html';
    case 'speed_script':
      return 'js';
    case 'gbp_draft':
      return 'txt';
    case 'content_brief':
      return 'md';
    case 'aria_fix':
      return 'html';
    case 'wp_plugin':
      return 'php';
    default:
      return 'txt';
  }
}

/**
 * Create and persist a delivery bundle record
 */
export async function createBundleRecord(
  tenantId: string,
  proposalId: string,
  zipUrl: string,
  readmeContent: string,
  artifactCount: number
): Promise<DeliveryBundle> {
  const bundle = await prisma.deliveryBundle.create({
    data: {
      tenantId,
      proposalId,
      zipUrl,
      readmeContent,
      artifactCount,
      status: 'ready',
    },
  });

  return bundle as DeliveryBundle;
}
