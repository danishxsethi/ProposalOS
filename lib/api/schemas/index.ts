/**
 * Central export for all API validation schemas
 *
 * Use these schemas to validate request bodies, query params, and path params
 * across all API endpoints.
 */

import { z } from 'zod';

import type { ZodIssue, ZodType } from 'zod';

// Re-export all schemas
export * from './audit';
export * from './proposal';
export * from './settings';
export * from './pipeline';
export * from './outreach';
export * from './analytics';

// Re-export zod for creating new schemas
export { z } from 'zod';

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details: ZodIssue[] } };

/**
 * Validation helper function
 *
 * @example
 * const result = validateRequest(auditTriggerSchema, body);
 * if (!result.success) {
 *   return NextResponse.json({ error: result.error.message }, { status: 400 });
 * }
 * // Use result.data...
 */
export function validateRequest<T>(schema: ZodType<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: result.error.errors[0]?.message || 'Validation failed',
        details: result.error.errors,
      },
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Create validated JSON response helper
 */
export function createJsonResponse<T>(data: T, status: number = 200): Response {
  return Response.json(data, { status });
}

/**
 * Create error JSON response helper
 */
export function createErrorResponse(message: string, status: number, code?: string): Response {
  return Response.json(
    {
      error: {
        code: code || 'ERROR',
        message,
      },
    },
    { status }
  );
}
