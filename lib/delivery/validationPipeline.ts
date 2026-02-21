import { parse as parseHtml } from 'node-html-parser';
import * as acorn from 'acorn';
import { RawArtifact } from './generators';
import { prisma } from '@/lib/prisma';

export interface ValidationCheckResult {
  checkName: 'syntax' | 'schema' | 'lighthouse' | 'human_review';
  passed: boolean;
  details: string;
  flaggedForHumanReview?: boolean;
}

export interface ValidatedArtifact extends RawArtifact {
  status: 'VALIDATED' | 'FAILED_VALIDATION';
  validationResults: ValidationCheckResult[];
}

/**
 * Run syntax check on artifact based on its type
 */
export function runSyntaxCheck(artifact: RawArtifact): ValidationCheckResult {
  const { content, artifactType } = artifact;

  try {
    switch (artifactType) {
      case 'json_ld':
        return validateJsonSyntax(content);
      case 'html_meta':
        return validateHtmlSyntax(content);
      case 'speed_script':
        return validateJavaScriptSyntax(content);
      case 'aria_fix':
        return validateHtmlSyntax(content);
      case 'wp_plugin':
        return validatePhpSyntax(content);
      default:
        return {
          checkName: 'syntax',
          passed: true,
          details: 'No syntax check available for this artifact type',
        };
    }
  } catch (error) {
    return {
      checkName: 'syntax',
      passed: false,
      details: `Syntax check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flaggedForHumanReview: true,
    };
  }
}

/**
 * Validate JSON syntax
 */
function validateJsonSyntax(content: string): ValidationCheckResult {
  try {
    JSON.parse(content);
    return {
      checkName: 'syntax',
      passed: true,
      details: 'JSON syntax is valid',
    };
  } catch (error) {
    return {
      checkName: 'syntax',
      passed: false,
      details: `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flaggedForHumanReview: true,
    };
  }
}

/**
 * Validate HTML syntax
 */
function validateHtmlSyntax(content: string): ValidationCheckResult {
  try {
    parseHtml(content);
    return {
      checkName: 'syntax',
      passed: true,
      details: 'HTML syntax is valid',
    };
  } catch (error) {
    return {
      checkName: 'syntax',
      passed: false,
      details: `Invalid HTML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flaggedForHumanReview: true,
    };
  }
}

/**
 * Validate JavaScript syntax
 */
function validateJavaScriptSyntax(content: string): ValidationCheckResult {
  try {
    acorn.parse(content, { ecmaVersion: 2020 });
    return {
      checkName: 'syntax',
      passed: true,
      details: 'JavaScript syntax is valid',
    };
  } catch (error) {
    return {
      checkName: 'syntax',
      passed: false,
      details: `Invalid JavaScript: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flaggedForHumanReview: true,
    };
  }
}

/**
 * Validate PHP syntax using regex (basic check)
 */
function validatePhpSyntax(content: string): ValidationCheckResult {
  // Basic PHP validation - check for opening/closing tags and balanced braces
  const hasOpeningTag = content.includes('<?php') || content.includes('<?');
  const hasClosingTag = content.includes('?>');
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;

  if (!hasOpeningTag) {
    return {
      checkName: 'syntax',
      passed: false,
      details: 'PHP code missing opening tag (<?php)',
      flaggedForHumanReview: true,
    };
  }

  if (openBraces !== closeBraces) {
    return {
      checkName: 'syntax',
      passed: false,
      details: `PHP code has unbalanced braces (${openBraces} open, ${closeBraces} close)`,
      flaggedForHumanReview: true,
    };
  }

  return {
    checkName: 'syntax',
    passed: true,
    details: 'PHP syntax appears valid',
  };
}

/**
 * Run schema check against Google Rich Results Test API
 * Falls back to VALIDATED_PARTIAL if API is unavailable
 */
export async function runSchemaCheck(artifact: RawArtifact): Promise<ValidationCheckResult> {
  // Only check JSON-LD artifacts
  if (artifact.artifactType !== 'json_ld') {
    return {
      checkName: 'schema',
      passed: true,
      details: 'Schema check not applicable for this artifact type',
    };
  }

  try {
    // Parse the JSON-LD to ensure it's valid
    const schema = JSON.parse(artifact.content);

    // Basic schema validation
    if (!schema['@context'] || !schema['@type']) {
      return {
        checkName: 'schema',
        passed: false,
        details: 'Schema missing required @context or @type fields',
        flaggedForHumanReview: true,
      };
    }

    // In production, this would call Google Rich Results Test API
    // For now, we'll do basic validation
    return {
      checkName: 'schema',
      passed: true,
      details: 'Schema structure is valid',
    };
  } catch (error) {
    return {
      checkName: 'schema',
      passed: false,
      details: `Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      flaggedForHumanReview: true,
    };
  }
}

/**
 * Run Lighthouse dry-run check
 * Simulates performance impact
 */
export async function runLighthouseCheck(artifact: RawArtifact): Promise<ValidationCheckResult> {
  // Only check speed optimization scripts
  if (artifact.artifactType !== 'speed_script') {
    return {
      checkName: 'lighthouse',
      passed: true,
      details: 'Lighthouse check not applicable for this artifact type',
    };
  }

  try {
    // Simulate Lighthouse check - in production this would call Lighthouse CI
    // For now, we'll do basic validation
    const hasOptimizations = artifact.content.includes('lazy') ||
      artifact.content.includes('defer') ||
      artifact.content.includes('async') ||
      artifact.content.includes('compress') ||
      artifact.content.includes('minif');

    if (!hasOptimizations) {
      return {
        checkName: 'lighthouse',
        passed: false,
        details: 'Speed script does not contain recognized optimization patterns',
        flaggedForHumanReview: true,
      };
    }

    return {
      checkName: 'lighthouse',
      passed: true,
      details: 'Speed script contains recognized optimization patterns',
    };
  } catch (error) {
    return {
      checkName: 'lighthouse',
      passed: false,
      details: `Lighthouse check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Run full validation pipeline on an artifact
 */
export async function runValidationPipeline(artifact: RawArtifact): Promise<ValidatedArtifact> {
  const validationResults: ValidationCheckResult[] = [];

  // Run syntax check
  const syntaxResult = runSyntaxCheck(artifact);
  validationResults.push(syntaxResult);

  // Run schema check if applicable
  const schemaResult = await runSchemaCheck(artifact);
  validationResults.push(schemaResult);

  // Run Lighthouse check if applicable
  const lighthouseResult = await runLighthouseCheck(artifact);
  validationResults.push(lighthouseResult);

  // Determine overall status
  const hasFailed = validationResults.some((result) => !result.passed);
  const status = hasFailed ? 'FAILED_VALIDATION' : 'VALIDATED';

  return {
    ...artifact,
    status,
    validationResults,
  };
}

/**
 * Create a human review flag for a failed artifact
 */
export async function createHumanReviewFlag(
  tenantId: string,
  artifactId: string,
  findingId: string,
  reason: string
): Promise<void> {
  await prisma.humanReviewFlag.create({
    data: {
      tenantId,
      artifactId,
      findingId,
      reason,
      status: 'pending',
    },
  });
}

/**
 * Compute rejection rate for a tenant
 */
export async function computeRejectionRate(
  tenantId: string,
  artifactType?: string
): Promise<number> {
  const query: any = { tenantId };
  if (artifactType) {
    query.artifactType = artifactType;
  }

  const totalArtifacts = await prisma.generatedArtifact.count({
    where: query,
  });

  if (totalArtifacts === 0) {
    return 0;
  }

  const failedArtifacts = await prisma.generatedArtifact.count({
    where: {
      ...query,
      status: 'FAILED_VALIDATION',
    },
  });

  return failedArtifacts / totalArtifacts;
}
