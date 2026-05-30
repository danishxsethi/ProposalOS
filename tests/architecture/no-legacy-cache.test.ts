import fs from 'fs';
import path from 'path';
import { describe, test, expect } from 'vitest';

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

describe('Architecture boundary guard: No legacy cache import in production modules', () => {
  test('Active production modules and outreach files must not import from apiCache', () => {
    const modulesDir = path.resolve(__dirname, '../../lib/modules');
    const outreachDir = path.resolve(__dirname, '../../lib/outreach');

    const moduleFiles = getAllFiles(modulesDir);
    const outreachFiles = getAllFiles(outreachDir);
    const allScannedFiles = [...moduleFiles, ...outreachFiles];

    expect(allScannedFiles.length).toBeGreaterThan(0);

    const violations: { file: string; line: string; lineNum: number }[] = [];

    allScannedFiles.forEach((filePath) => {
      // Skip test files themselves
      if (filePath.includes('/__tests__/') || filePath.endsWith('.test.ts') || filePath.endsWith('.spec.ts')) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Look for imports or requires of apiCache
        if (
          (line.includes('apiCache') || line.includes('cachedFetch')) &&
          (line.trim().startsWith('import') || line.trim().startsWith('const') || line.trim().startsWith('let'))
        ) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '../..'), filePath),
            line: line.trim(),
            lineNum: index + 1,
          });
        }
      });
    });

    if (violations.length > 0) {
      console.error('Violations found where production files import apiCache/cachedFetch:');
      violations.forEach((v) => {
        console.error(`  - ${v.file}:${v.lineNum}: "${v.line}"`);
      });
    }

    expect(violations, 'No production modules or outreach should import or require apiCache/cachedFetch').toHaveLength(0);
  });
});
