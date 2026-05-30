/**
 * Seed Initial Prompts to Database
 *
 * This script migrates existing prompts from prompts/ directory
 * to the PromptVersion table for database-backed prompt management.
 *
 * Usage: npx ts-node scripts/seed-prompts.ts
 */

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map prompt filenames to node IDs
const PROMPT_NODE_MAPPING: Record<string, string> = {
  'exec-summary-v1.txt': 'executive_summary_v1',
  'exec-summary-v2.txt': 'executive_summary_v2',
  'exec-overview-v2.txt': 'executive_overview_v2',
  'clustering-v1.txt': 'clustering_v1',
  'cluster-deep-dive-v2.txt': 'cluster_deep_dive_v2',
  'competitive-summary-v2.txt': 'competitive_summary_v2',
  'opportunity-summary-v2.txt': 'opportunity_summary_v2',
  'narrative-v1.txt': 'narrative_v1',
  'narrative-direct.txt': 'narrative_direct',
  'narrative-concerned.txt': 'narrative_concerned',
};

interface PromptSeed {
  nodeId: string;
  promptText: string;
  changelog: string;
  branchName?: string;
}

// Extract node ID from filename
function extractNodeId(filename: string): string {
  const baseName = filename.replace('.txt', '');
  return PROMPT_NODE_MAPPING[filename] || baseName.replace(/-/g, '_');
}

// Generate version hash
function generateVersionHash(nodeId: string, promptText: string): string {
  const content = `${nodeId}:${promptText}:${new Date().toISOString()}`;
  return createHash('sha256').update(content).digest('hex');
}

// Read all prompt files
async function loadPrompts(promptsDir: string): Promise<PromptSeed[]> {
  const files = readdirSync(promptsDir).filter((f) => f.endsWith('.txt'));
  const prompts: PromptSeed[] = [];

  console.log(`Found ${files.length} prompt files`);

  for (const file of files) {
    const filePath = join(promptsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const nodeId = extractNodeId(file);

    prompts.push({
      nodeId,
      promptText: content,
      changelog: `Imported from prompts/${file}`,
      branchName: 'main',
    });

    console.log(`  ✓ Loaded: ${file} -> ${nodeId}`);
  }

  return prompts;
}

// Seed prompts to database
async function seedPrompts(): Promise<void> {
  const promptsDir = join(process.cwd(), 'prompts');

  console.log('🌱 Starting prompt seed...\n');

  // Load prompts from files
  const prompts = await loadPrompts(promptsDir);

  let created = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    try {
      // Check if this node already has an active version
      const existing = await prisma.promptVersion.findFirst({
        where: {
          nodeId: prompt.nodeId,
          environment: 'production',
          isActive: true,
        },
      });

      if (existing) {
        console.log(`  ⏭️  Skipped: ${prompt.nodeId} (already exists)`);
        skipped++;
        continue;
      }

      // Create new version
      const versionHash = generateVersionHash(prompt.nodeId, prompt.promptText);

      await prisma.promptVersion.create({
        data: {
          versionHash,
          nodeId: prompt.nodeId,
          promptText: prompt.promptText,
          createdBy: 'seed-script',
          parentVersionHash: null,
          branchName: prompt.branchName || 'main',
          changelog: prompt.changelog,
          isActive: true,
          environment: 'production',
          metadata: {
            source: 'prompts-directory',
            importedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`  ✅ Created: ${prompt.nodeId}`);
      created++;
    } catch (error) {
      console.error(`  ❌ Error seeding ${prompt.nodeId}:`, error);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  - Created: ${created}`);
  console.log(`  - Skipped: ${skipped}`);
  console.log(`  - Total: ${prompts.length}`);
}

// Run seed
async function main(): Promise<void> {
  try {
    await seedPrompts();
    console.log('\n✅ Seed completed successfully!');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
