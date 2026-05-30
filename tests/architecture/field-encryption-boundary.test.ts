/**
 * tests/architecture/field-encryption-boundary.test.ts
 *
 * Architectural boundary tests ensuring that:
 * - NextAuth Account writes are only handled inside the wrapped Prisma adapter.
 * - No direct prisma.account.create/update calls occur in app/lib folders.
 * - No sensitive env key variable names are referenced outside keyring/backfill modules.
 * - No console.log or printing of tokens/secrets occurs in app or lib folders.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('Field Encryption Architectural Boundaries', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function scanDir(dir: string, callback: (filePath: string) => void) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
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
        if (
          filePath.endsWith('.ts') ||
          filePath.endsWith('.tsx') ||
          filePath.endsWith('.js') ||
          filePath.endsWith('.jsx')
        ) {
          callback(filePath);
        }
      }
    }
  }

  it('enforces that no standard app/lib code directly invokes prisma.account.create or update', () => {
    const offendingFiles: string[] = [];

    const appDir = path.join(rootDir, 'app');
    const libDir = path.join(rootDir, 'lib');

    const checkDirectWrites = (filePath: string) => {
      // Allowlist wrappedPrismaAdapter.ts and other allowed core auth/migration scripts
      if (
        filePath.endsWith('wrappedPrismaAdapter.ts') ||
        filePath.endsWith('backfill-encrypted-fields.ts')
      ) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Check for raw prisma.account.create, update, updateMany, createMany
      const rawWriteRegex = /prisma\.account\.(create|update)/i;
      if (rawWriteRegex.test(content)) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(appDir)) scanDir(appDir, checkDirectWrites);
    if (fs.existsSync(libDir)) scanDir(libDir, checkDirectWrites);

    expect(offendingFiles).toEqual([]);
  });

  it('ensures FIELD_ENCRYPTION_PRIMARY_KEY is referenced ONLY in the keyring/backfill or test files', () => {
    const offendingFiles: string[] = [];

    const appDir = path.join(rootDir, 'app');
    const libDir = path.join(rootDir, 'lib');

    const checkEnvReferences = (filePath: string) => {
      // Allowlist keyring.ts and envelope tests
      if (
        filePath.endsWith('keyring.ts') ||
        filePath.endsWith('envelope.test.ts') ||
        filePath.endsWith('keyring.test.ts')
      ) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('FIELD_ENCRYPTION_PRIMARY_KEY')) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(appDir)) scanDir(appDir, checkEnvReferences);
    if (fs.existsSync(libDir)) scanDir(libDir, checkEnvReferences);

    expect(offendingFiles).toEqual([]);
  });

  it('prevents raw console.log of oauth/security secrets', () => {
    const offendingFiles: string[] = [];

    const appDir = path.join(rootDir, 'app');
    const libDir = path.join(rootDir, 'lib');

    const checkConsoleLogs = (filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Match console.log calling with variables matching credential keywords
      const consoleLogRegex = /console\.log\(.*(access_token|refresh_token|id_token|apiKey|password).*/i;
      if (consoleLogRegex.test(content)) {
        offendingFiles.push(filePath);
      }
    };

    if (fs.existsSync(appDir)) scanDir(appDir, checkConsoleLogs);
    if (fs.existsSync(libDir)) scanDir(libDir, checkConsoleLogs);

    expect(offendingFiles).toEqual([]);
  });
});
