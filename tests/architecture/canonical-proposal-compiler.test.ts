import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const PRODUCTION_ROOTS = ['app/api', 'lib/pipeline', 'lib/outreach', 'lib/proposal'];
const ALLOWED_CREATE_FILE = 'lib/proposal/compiler.ts';
const ALLOWED_QA_FILE = 'lib/proposal/compiler.ts';

function sourceFiles(directory: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'tests') continue;
      result.push(...sourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      result.push(fullPath);
    }
  }
  return result;
}

describe('canonical proposal compiler architecture', () => {
  it('routes every production proposal generator through the shared compiler', () => {
    const files = PRODUCTION_ROOTS.flatMap((root) => sourceFiles(path.join(ROOT, root)));
    const directWrites: string[] = [];
    const qaEvaluations: string[] = [];

    for (const file of files) {
      const relative = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf8');
      if (/prisma\.proposal\.create\s*\(/.test(content) && relative !== ALLOWED_CREATE_FILE) {
        directWrites.push(relative);
      }
      if (/ProposalQAService\.evaluateProposal\s*\(/.test(content) && relative !== ALLOWED_QA_FILE) {
        qaEvaluations.push(relative);
      }
    }

    expect(directWrites).toEqual([]);
    expect(qaEvaluations).toEqual([]);

    const expectedCallers = [
      'app/api/audit/[id]/propose/route.ts',
      'app/api/audit/[id]/regenerate/route.ts',
      'lib/proposal/runner.ts',
      'lib/pipeline/stages/diagnosisProposalStage.ts',
    ];
    for (const relative of expectedCallers) {
      expect(fs.readFileSync(path.join(ROOT, relative), 'utf8'), relative)
        .toContain('compileAndPersistProposal');
    }
    const outreach = fs.readFileSync(
      path.join(ROOT, 'lib/outreach/AutomatedOutreachOrchestrator.ts'),
      'utf8'
    );
    expect(outreach).toContain('generateProposal');
    expect(outreach).not.toContain('ProposalQAService.evaluateProposal');
  });
});
