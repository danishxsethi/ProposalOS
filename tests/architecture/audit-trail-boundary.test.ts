import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Audit trail architectural boundary and immutability tests', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function scanDir(dir: string, callback: (filePath: string) => void) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Skip node_modules, .next, .git, and test directories
        if (
          file !== 'node_modules' &&
          file !== '.next' &&
          file !== '.git' &&
          file !== 'tests' &&
          file !== '__tests__'
        ) {
          scanDir(filePath, callback);
        }
      } else if (stat.isFile()) {
        // Only inspect TS/JS files
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
          callback(filePath);
        }
      }
    }
  }

  it('proves that AuditTrailEvent is append-only by enforcing no update/delete database calls', () => {
    const offendingFiles: string[] = [];

    // Scan app/ and lib/
    const appDir = path.join(rootDir, 'app');
    const libDir = path.join(rootDir, 'lib');

    const checkImmutability = (filePath: string) => {
      // Allowlist lib/observability/auditTrail.ts and verification/retention tools if any
      if (filePath.endsWith('lib/observability/auditTrail.ts')) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      // Match prisma.auditTrailEvent.update, prisma.auditTrailEvent.delete, prisma.auditTrailEvent.updateMany, prisma.auditTrailEvent.deleteMany
      const updateRegex = /prisma\.auditTrailEvent\.(update|delete)/i;
      if (updateRegex.test(content)) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(appDir)) scanDir(appDir, checkImmutability);
    if (fs.existsSync(libDir)) scanDir(libDir, checkImmutability);

    expect(offendingFiles).toEqual([]);
  });

  it('proves that key flow files properly import and invoke recordAuditTrailEvent', () => {
    const filesToVerify = [
      path.join(rootDir, 'app/api/stripe/webhook/route.ts'),
      path.join(rootDir, 'lib/stripe/webhookHandler.ts'),
      path.join(rootDir, 'lib/auth.ts'),
      path.join(rootDir, 'app/api/case-study/[auditId]/generate/route.ts'),
      path.join(rootDir, 'app/api/proposal/token/[token]/status/route.ts'),
      path.join(rootDir, 'app/api/settings/api-keys/route.ts'),
      path.join(rootDir, 'app/api/settings/api-keys/[id]/route.ts'),
      path.join(rootDir, 'lib/queue/auditJobWorker.ts'),
    ];

    for (const file of filesToVerify) {
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toContain('recordAuditTrailEvent');
    }
  });
});
