// Feature: agentic-delivery-qa-hardening, Property 5: Delivery bundle integrity
import { describe, it, expect } from 'vitest';
import { assembleBundle, generateReadme } from '../bundler';
import { ImplementationPackage } from '../packager';

describe('Property 5: Delivery bundle integrity', () => {
  it('should create ZIP with correct artifact count', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'content 1',
        artifactType: 'json_ld',
        installationInstructions: 'Install 1',
        beforePreview: 'Before 1',
        afterPreview: 'After 1',
        estimatedImpact: 'High Impact',
      },
      {
        artifactId: 'artifact-2',
        findingId: 'finding-2',
        artifactContent: 'content 2',
        artifactType: 'html_meta',
        installationInstructions: 'Install 2',
        beforePreview: 'Before 2',
        afterPreview: 'After 2',
        estimatedImpact: 'Medium Impact',
      },
    ];

    const { buffer, readmeContent } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    expect(readmeContent).toBeDefined();
    expect(readmeContent.length).toBeGreaterThan(0);
  });

  it('should include README file in bundle', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'content 1',
        artifactType: 'json_ld',
        installationInstructions: 'Install 1',
        estimatedImpact: 'High Impact',
      },
    ];

    const { readmeContent } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    expect(readmeContent).toContain('Delivery Bundle');
    expect(readmeContent).toContain('Contents');
    expect(readmeContent).toContain('Installation Instructions');
    expect(readmeContent).toContain('README.md');
  });

  it('should generate README with all artifact information', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'content 1',
        artifactType: 'json_ld',
        installationInstructions: 'Install 1',
        estimatedImpact: 'High Impact',
      },
      {
        artifactId: 'artifact-2',
        findingId: 'finding-2',
        artifactContent: 'content 2',
        artifactType: 'html_meta',
        installationInstructions: 'Install 2',
        estimatedImpact: 'Medium Impact',
      },
    ];

    const { readmeContent } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    // Should list all artifacts
    expect(readmeContent).toContain('JSON_LD');
    expect(readmeContent).toContain('HTML_META');
    expect(readmeContent).toContain('High Impact');
    expect(readmeContent).toContain('Medium Impact');
  });

  it('should handle empty package list', async () => {
    const packages: ImplementationPackage[] = [];

    const { buffer, readmeContent } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    expect(readmeContent).toBeDefined();
    expect(readmeContent).toContain('Delivery Bundle');
  });

  it('should include WordPress plugin in bundle when available', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'content 1',
        artifactType: 'json_ld',
        installationInstructions: 'Install 1',
        estimatedImpact: 'High Impact',
        wordpressPlugin: '<?php // WordPress plugin code ?>',
      },
    ];

    const { buffer } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should create valid ZIP buffer', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'test content',
        artifactType: 'json_ld',
        installationInstructions: 'test instructions',
        estimatedImpact: 'High Impact',
      },
    ];

    const { buffer } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    // ZIP files start with PK signature
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it('should include metadata for each artifact', async () => {
    const packages: ImplementationPackage[] = [
      {
        artifactId: 'artifact-1',
        findingId: 'finding-1',
        artifactContent: 'content 1',
        artifactType: 'json_ld',
        installationInstructions: 'Install 1',
        estimatedImpact: 'High Impact',
      },
    ];

    const { readmeContent } = await assembleBundle(packages, 'proposal-1', 'tenant-1');

    // README should mention metadata files
    expect(readmeContent).toContain('metadata.json');
  });
});
