/**
 * API Versioning Middleware
 *
 * Handles API versioning with /v1/ prefix and deprecation warnings.
 * Supports version negotiation via headers and URL path.
 */

import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';

export type ApiVersion = 'v1' | 'v2';

export interface VersionConfig {
  version: ApiVersion;
  deprecated?: boolean;
  deprecationDate?: string;
  sunsetDate?: string;
  migrationUrl?: string;
}

/**
 * API version registry
 */
export const API_VERSIONS: Record<ApiVersion, VersionConfig> = {
  v1: {
    version: 'v1',
    deprecated: false,
  },
  v2: {
    version: 'v2',
    deprecated: false,
  },
};

/**
 * Current stable API version
 */
export const CURRENT_API_VERSION: ApiVersion = 'v1';

/**
 * Extract API version from request
 * Priority: URL path > Accept header > Default
 */
export function extractApiVersion(req: Request): ApiVersion {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');

  // Check URL path for version (e.g., /api/v1/...)
  const pathVersion = pathParts.find((p) => p.startsWith('v')) as ApiVersion | undefined;
  if (pathVersion && API_VERSIONS[pathVersion]) {
    return pathVersion;
  }

  // Check Accept header for version (e.g., application/vnd.api+json; version=1)
  const acceptHeader = req.headers.get('accept') || '';
  const versionMatch = acceptHeader.match(/version=(\d+)/i);
  if (versionMatch) {
    const headerVersion = `v${versionMatch[1]}` as ApiVersion;
    if (API_VERSIONS[headerVersion]) {
      return headerVersion;
    }
  }

  // Check custom header
  const apiVersionHeader = req.headers.get('x-api-version');
  if (apiVersionHeader && API_VERSIONS[apiVersionHeader as ApiVersion]) {
    return apiVersionHeader as ApiVersion;
  }

  // Default to current version
  return CURRENT_API_VERSION;
}

/**
 * Add version-related headers to response
 */
export function addVersionHeaders(
  response: Response,
  version: ApiVersion,
  config: VersionConfig
): void {
  // Current API version
  response.headers.set('X-API-Version', version);

  // Deprecation header (RFC 8631)
  if (config.deprecated && config.deprecationDate) {
    response.headers.set('Deprecation', config.deprecationDate);
  }

  // Sunset header (RFC 8594)
  if (config.sunsetDate) {
    response.headers.set('Sunset', config.sunsetDate);
  }

  // Link to migration docs
  if (config.migrationUrl) {
    response.headers.set('Link', `<${config.migrationUrl}>; rel="deprecation"`);
  }
}

/**
 * Create deprecation warning
 */
export function createDeprecationWarning(config: VersionConfig): string {
  if (!config.deprecated) return '';

  let warning = `API version ${config.version} is deprecated`;

  if (config.sunsetDate) {
    warning += ` and will be removed on ${config.sunsetDate}`;
  }

  if (config.migrationUrl) {
    warning += `. Please migrate to ${config.migrationUrl}`;
  }

  return warning;
}

/**
 * Wrap handler with API versioning support
 */
export function withApiVersion<T extends Response | NextResponse>(
  handler: (req: Request, version: ApiVersion) => Promise<T>,
  config?: Partial<VersionConfig>
) {
  return async function versionedHandler(req: Request): Promise<T | NextResponse> {
    const version = extractApiVersion(req);
    const versionConfig = { ...API_VERSIONS[version], ...config };

    // Log deprecation warning if applicable
    if (versionConfig.deprecated) {
      const warning = createDeprecationWarning(versionConfig);
      logger.warn({ version, path: req.url }, warning);
    }

    try {
      const response = await handler(req, version);

      // Add version headers
      addVersionHeaders(response, version, versionConfig);

      // Add deprecation warning header if applicable
      if (versionConfig.deprecated) {
        const warning = createDeprecationWarning(versionConfig);
        response.headers.set('X-Deprecation-Warning', warning);
      }

      return response;
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Validate that the requested version is supported
 */
export function isVersionSupported(version: string): version is ApiVersion {
  return version in API_VERSIONS;
}

/**
 * Get all supported versions
 */
export function getSupportedVersions(): ApiVersion[] {
  return Object.keys(API_VERSIONS) as ApiVersion[];
}

/**
 * Check if a version is deprecated
 */
export function isVersionDeprecated(version: ApiVersion): boolean {
  return API_VERSIONS[version]?.deprecated || false;
}

/**
 * Deprecation notice for responses
 */
export interface DeprecationNotice {
  version: ApiVersion;
  deprecated: boolean;
  deprecationDate?: string;
  sunsetDate?: string;
  migrationUrl?: string;
  message?: string;
}

/**
 * Create deprecation notice object
 */
export function createDeprecationNotice(
  version: ApiVersion,
  config: VersionConfig
): DeprecationNotice {
  return {
    version,
    deprecated: config.deprecated || false,
    deprecationDate: config.deprecationDate,
    sunsetDate: config.sunsetDate,
    migrationUrl: config.migrationUrl,
    message: createDeprecationWarning(config),
  };
}
