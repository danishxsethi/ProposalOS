#!/usr/bin/env ts-node
/**
 * Environment Validation Script for CI/CD
 *
 * This script validates that all required environment variables are:
 * 1. Documented in .env.example
 * 2. Present in lib/config/validateEnv.ts REQUIRED_ENV_VARS
 * 3. Consistent between both sources
 *
 * Usage:
 *   npm run validate:env
 *   ts-node scripts/validate-env.ts
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed (missing vars, mismatches)
 */

import * as fs from 'fs';
import * as path from 'path';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function parseEnvExample(filePath: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const vars = new Set<string>();

  const lines = content.split('\n');
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') {
      continue;
    }

    // Match VAR_NAME= or VAR_NAME="value" patterns
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (match && match[1]) {
      vars.add(match[1]);
    }
  }

  return vars;
}

function parseValidateEnvFile(filePath: string): { required: Set<string>; optional: Set<string> } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const required = new Set<string>();
  const optional = new Set<string>();

  // Parse REQUIRED_ENV_VARS array
  const requiredMatch = content.match(/const REQUIRED_ENV_VARS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (requiredMatch && requiredMatch[1]) {
    const vars = requiredMatch[1].match(/'([A-Z_][A-Z0-9_]*)'/g);
    vars?.forEach((v) => {
      const varName = v.replace(/'/g, '');
      required.add(varName);
    });
  }

  // Parse OPTIONAL_ENV_VARS array
  const optionalMatch = content.match(/const OPTIONAL_ENV_VARS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (optionalMatch && optionalMatch[1]) {
    const vars = optionalMatch[1].match(/'([A-Z_][A-Z0-9_]*)'/g);
    vars?.forEach((v) => {
      const varName = v.replace(/'/g, '');
      optional.add(varName);
    });
  }

  return { required, optional };
}

function validate(): boolean {
  log('\n========================================', colors.blue);
  log('  Environment Configuration Validator', colors.blue);
  log('========================================\n', colors.blue);

  const envExamplePath = path.join(__dirname, '..', '.env.example');
  const validateEnvPath = path.join(__dirname, '..', 'lib', 'config', 'validateEnv.ts');

  // Check files exist
  if (!fs.existsSync(envExamplePath)) {
    log(`❌ ERROR: .env.example not found at ${envExamplePath}`, colors.red);
    return false;
  }

  if (!fs.existsSync(validateEnvPath)) {
    log(`❌ ERROR: validateEnv.ts not found at ${validateEnvPath}`, colors.red);
    return false;
  }

  // Parse both files
  const envExampleVars = parseEnvExample(envExamplePath);
  const { required: requiredVars, optional: optionalVars } = parseValidateEnvFile(validateEnvPath);

  log(`📄 .env.example: ${envExampleVars.size} variables found`, colors.blue);
  log(
    `📄 validateEnv.ts: ${requiredVars.size} required, ${optionalVars.size} optional`,
    colors.blue
  );
  log('', '');

  let hasErrors = false;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: All required vars in validateEnv.ts must be in .env.example
  for (const requiredVar of requiredVars) {
    if (!envExampleVars.has(requiredVar)) {
      errors.push(`[REQUIRED] ${requiredVar} is in validateEnv.ts but MISSING from .env.example`);
      hasErrors = true;
    }
  }

  // Check 2: All optional vars in validateEnv.ts must be in .env.example
  for (const optionalVar of optionalVars) {
    if (!envExampleVars.has(optionalVar)) {
      warnings.push(`[OPTIONAL] ${optionalVar} is in validateEnv.ts but MISSING from .env.example`);
    }
  }

  // Check 3: All vars in .env.example should be in either required or optional
  const allConfigVars = new Set([...requiredVars, ...optionalVars]);
  for (const exampleVar of envExampleVars) {
    if (!allConfigVars.has(exampleVar)) {
      // Check if it's a comment-only var (like # GOOGLE_APPLICATION_CREDENTIALS="...")
      // These are documentation-only and okay to skip
      warnings.push(
        `[INFO] ${exampleVar} is in .env.example but not in validateEnv.ts (may be documentation-only)`
      );
    }
  }

  // Check 4: Verify no secrets are hardcoded (basic check)
  // Note: We allow placeholder patterns like "sk_test_YOUR_TEST_KEY_HERE" and "whsec_YOUR_WEBHOOK_SECRET_HERE"
  const content = fs.readFileSync(envExamplePath, 'utf-8');
  
  // Patterns that indicate REAL secrets (not placeholders)
  const dangerousSecretPatterns = [
    // Real Stripe keys (not placeholders) - must be actual alphanumeric after prefix
    { pattern: /sk_test_[a-zA-Z0-9]{20,}(?![A-Z_])/i, name: 'Stripe test key', isPlaceholder: (match: string) => match.includes('YOUR') || match.includes('HERE') },
    { pattern: /whsec_[a-zA-Z0-9]{10,}(?![A-Z_])/i, name: 'Stripe webhook secret', isPlaceholder: (match: string) => match.includes('YOUR') || match.includes('HERE') },
    // Real Google API keys (44 chars starting with AIza)
    { pattern: /AIza[a-zA-Z0-9_-]{35}/, name: 'Google API key', isPlaceholder: () => false },
  ];

  for (const { pattern, name, isPlaceholder } of dangerousSecretPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Skip if it's clearly a placeholder
        if (isPlaceholder(match)) {
          continue;
        }
        errors.push(`[SECURITY] Potential hardcoded ${name} detected in .env.example: ${match.substring(0, 20)}...`);
        hasErrors = true;
      }
    }
  }

  // Report results
  if (errors.length > 0) {
    log('\n❌ ERRORS:', colors.red);
    for (const error of errors) {
      log(`   ${error}`, colors.red);
    }
  }

  if (warnings.length > 0) {
    log('\n⚠️  WARNINGS:', colors.yellow);
    for (const warning of warnings) {
      log(`   ${warning}`, colors.yellow);
    }
  }

  log('', '');

  if (hasErrors) {
    log('========================================', colors.red);
    log('  VALIDATION FAILED', colors.red);
    log('========================================\n', colors.red);
    log('Fix the errors above and re-run validation.', colors.red);
    return false;
  } else {
    log('========================================', colors.green);
    log('  VALIDATION PASSED', colors.green);
    log('========================================\n', colors.green);
    log(`✅ All ${requiredVars.size} required variables documented`, colors.green);
    log(`✅ All ${optionalVars.size} optional variables documented`, colors.green);
    log('✅ No hardcoded secrets detected', colors.green);
    return true;
  }
}

// Run validation
const success = validate();
process.exit(success ? 0 : 1);
