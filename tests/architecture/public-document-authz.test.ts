import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';

function getFilesRecursively(dirPath: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return fileList;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  });

  return fileList;
}

describe('Architecture boundary guard: Public document and export routes authorization', () => {
  test('All high-risk PDF, case-study, and export API routes must enforce authorization', () => {
    const apiDir = path.resolve(__dirname, '../../app/api');
    const allApiFiles = getFilesRecursively(apiDir);

    // Target routes that perform PDF generation, case study building, or private data exports
    const documentRoutes = allApiFiles.filter((filePath) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const isRoute = normalizedPath.endsWith('/route.ts');
      const isDocPath =
        normalizedPath.includes('/generate/') ||
        normalizedPath.includes('/pdf/') ||
        normalizedPath.includes('/export/');
      return isRoute && isDocPath;
    });

    expect(documentRoutes.length).toBeGreaterThan(0);

    const violations: { file: string; missingPatterns: string[] }[] = [];

    // Approved authorization patterns
    const authPatterns = [
      'validateCaseStudyAccess',
      'getServerSession',
      'webLinkToken',
      'withAuth',
      'validateApiKey',
    ];

    documentRoutes.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasAuth = authPatterns.some((pattern) => content.includes(pattern));

      if (!hasAuth) {
        violations.push({
          file: path.relative(path.resolve(__dirname, '../..'), filePath),
          missingPatterns: authPatterns,
        });
      }
    });

    if (violations.length > 0) {
      console.error('Violations found in document api routes missing authorization checks:');
      violations.forEach((v) => {
        console.error(`  - ${v.file} does not contain any of: ${v.missingPatterns.join(', ')}`);
      });
    }

    expect(
      violations,
      'All PDF, case study generation, and private data export routes must enforce authorization checks'
    ).toHaveLength(0);
  });
});
