/**
 * Standardized Error Types for API Responses
 *
 * Provides consistent error handling across all endpoints
 * with error codes for programmatic handling.
 */

import { getTraceId } from '@/lib/observability/context';
import { generateTraceId as generateTraceIdValue } from '@/lib/observability/ids';

export enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  MISSING_HEADER = 'MISSING_HEADER',
  INVALID_HEADER = 'INVALID_HEADER',

  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // Business Logic Errors
  RESOURCE_EXPIRED = 'RESOURCE_EXPIRED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_STATE = 'INVALID_STATE',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
}

export interface ErrorDetails {
  field?: string;
  value?: unknown;
  reason?: string;
  [key: string]: unknown;
}

export interface ApiErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails | ErrorDetails[];
    traceId?: string;
    timestamp: string;
    path?: string;
  };
}

/**
 * Base API Error class
 */
export class ApiError extends Error {
  public code: ErrorCode;
  public details?: ErrorDetails | ErrorDetails[];
  public statusCode: number;

  constructor(
    code: ErrorCode,
    message: string,
    details?: ErrorDetails | ErrorDetails[],
    statusCode: number = 500
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }

  toEnvelope(path?: string, traceId?: string): ApiErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: new Date().toISOString(),
        traceId,
        path,
      },
    };
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', details?: ErrorDetails[]) {
    super(ErrorCode.VALIDATION_ERROR, message, details, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, identifier?: string) {
    super(
      ErrorCode.NOT_FOUND,
      `${resource} not found`,
      identifier ? { field: 'id', value: identifier } : undefined,
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, message, undefined, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Access denied') {
    super(ErrorCode.FORBIDDEN, message, undefined, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends ApiError {
  public retryAfter?: number;
  public limit?: number;
  public remaining?: number;
  public resetAt?: Date;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    resetAt?: Date
  ) {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, undefined, 429);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
    this.name = 'RateLimitError';
  }

  override toEnvelope(path?: string, traceId?: string): ApiErrorEnvelope {
    const envelope = super.toEnvelope(path, traceId);
    if (this.retryAfter) {
      envelope.error.details = { retryAfter: this.retryAfter };
    }
    return envelope;
  }
}

/**
 * Idempotency Conflict Error (409)
 */
export class IdempotencyConflictError extends ApiError {
  constructor(message: string = 'Request conflicts with an existing operation') {
    super(ErrorCode.IDEMPOTENCY_CONFLICT, message, undefined, 409);
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(ErrorCode.CONFLICT, message, undefined, 409);
    this.name = 'ConflictError';
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalError extends ApiError {
  constructor(message: string = 'Internal server error', details?: ErrorDetails) {
    super(ErrorCode.INTERNAL_ERROR, message, details, 500);
    this.name = 'InternalError';
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(ErrorCode.SERVICE_UNAVAILABLE, message, undefined, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request') {
    super(ErrorCode.BAD_REQUEST, message, undefined, 400);
    this.name = 'BadRequestError';
  }
}

/**
 * Create error response JSON
 */
export function createErrorResponse(
  error: ApiError,
  path?: string,
  traceId?: string
): { json: ApiErrorEnvelope; status: number } {
  return {
    json: error.toEnvelope(path, traceId),
    status: error.statusCode,
  };
}

/**
 * Generate a unique trace ID for error tracking
 */
export function generateTraceId(): string {
  try {
    return getTraceId();
  } catch {
    return generateTraceIdValue();
  }
}
