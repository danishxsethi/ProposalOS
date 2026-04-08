/**
 * OpenAPI / Swagger Specification Generator
 *
 * Auto-generates OpenAPI 3.1 specification from Zod schemas and route metadata.
 * Access at: GET /api/openapi.json
 */

import { NextResponse } from 'next/server';

/**
 * Generate OpenAPI specification
 */
function generateOpenApiSpec(): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: 'Proposal Engine API',
      description: `
# Proposal Engine API

AI-powered website audit and proposal generation engine.

## Authentication

API requests require authentication via one of these methods:

1. **API Key** (recommended for server-to-server):
   - Header: \`X-API-Key: pe_live_xxx\` or \`Authorization: Bearer pe_live_xxx\`
   - Tenant context: \`X-Tenant-ID: tenant_id\`

2. **Session Auth** (for dashboard users):
   - Cookie-based NextAuth session

## Rate Limiting

- Default: 60 requests per minute
- Audit trigger: 5 requests per minute
- Public API: 10 requests per minute

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`
- \`X-RateLimit-Remaining\`
- \`X-RateLimit-Reset\`
- \`Retry-After\` (when rate limited)

## Versioning

Current API version: v1

All endpoints are prefixed with \`/api/v1/\`. Version is also available via:
- URL path: \`/api/v1/...\`
- Header: \`X-API-Version: v1\`
- Accept header: \`application/vnd.api+json; version=1\`

## Error Responses

All errors follow this format:

\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {},
    "timestamp": "2024-01-15T10:30:00Z",
    "traceId": "trace_xxx"
  }
}
\`\`\`

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| NOT_FOUND | 404 | Resource not found |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Access denied |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| IDEMPOTENCY_CONFLICT | 409 | Duplicate request |
| INTERNAL_ERROR | 500 | Server error |
      `,
      version: '1.0.0',
      contact: {
        name: 'API Support',
        email: 'support@proposalengine.com',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        description: 'Current deployment',
      },
    ],
    tags: [
      { name: 'Audit', description: 'Website audit operations' },
      { name: 'Proposal', description: 'Proposal generation and management' },
      { name: 'Findings', description: 'Audit findings and diagnosis' },
      { name: 'Billing', description: 'Stripe billing and payments' },
      { name: 'Settings', description: 'Tenant settings and configuration' },
      { name: 'Admin', description: 'Admin and monitoring operations' },
      { name: 'Webhooks', description: 'Webhook endpoints' },
      { name: 'Public', description: 'Public API for partners' },
    ],
    paths: {
      '/api/v1/audit': {
        post: {
          tags: ['Audit'],
          summary: 'Trigger a new website audit',
          description:
            'Initiates a comprehensive website audit for accessibility, SEO, performance, and more.',
          operationId: 'triggerAudit',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: {
                      type: 'string',
                      format: 'uri',
                      description: 'Website URL to audit',
                      example: 'https://example.com',
                    },
                    businessName: {
                      type: 'string',
                      description: 'Business name',
                      example: 'Acme Inc.',
                    },
                    placeId: {
                      type: 'string',
                      description: 'Google Places ID',
                    },
                    industry: {
                      type: 'string',
                      description: 'Business industry',
                    },
                    businessCity: {
                      type: 'string',
                      description: 'Business city',
                    },
                    businessPhone: {
                      type: 'string',
                      description: 'Business phone number',
                    },
                    businessEmail: {
                      type: 'string',
                      format: 'email',
                      description: 'Business email',
                    },
                    priority: {
                      type: 'string',
                      enum: ['low', 'normal', 'high'],
                      default: 'normal',
                    },
                    skipCache: {
                      type: 'boolean',
                      default: false,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '202': {
              description: 'Audit triggered successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      auditId: { type: 'string', format: 'uuid' },
                      status: { type: 'string', enum: ['pending', 'running'] },
                      estimatedCompletionTime: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid request' },
            '401': { description: 'Unauthorized' },
            '429': { description: 'Rate limit exceeded' },
          },
          security: [{ apiKey: [] }, { session: [] }],
        },
        get: {
          tags: ['Audit'],
          summary: 'List audits',
          description: 'Retrieve a paginated list of audits with optional filtering.',
          operationId: 'listAudits',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            },
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
            },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of audits',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      audits: { type: 'array', items: { $ref: '#/components/schemas/Audit' } },
                      pagination: {
                        type: 'object',
                        properties: {
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          total: { type: 'integer' },
                          totalPages: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ apiKey: [] }, { session: [] }],
        },
      },
      '/api/v1/audit/{auditId}': {
        get: {
          tags: ['Audit'],
          summary: 'Get audit details',
          operationId: 'getAudit',
          parameters: [
            {
              name: 'auditId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Audit details' },
            '404': { description: 'Audit not found' },
          },
          security: [{ apiKey: [] }, { session: [] }],
        },
      },
      '/api/v1/audit/batch': {
        post: {
          tags: ['Audit'],
          summary: 'Trigger batch audit',
          description: 'Initiate audits for multiple websites at once.',
          operationId: 'triggerBatchAudit',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'items'],
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 200 },
                    items: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 100,
                      items: {
                        type: 'object',
                        required: ['url'],
                        properties: {
                          url: { type: 'string', format: 'uri' },
                          businessName: { type: 'string' },
                          placeId: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Batch audit triggered' },
            '400': { description: 'Invalid request' },
          },
          security: [{ apiKey: [] }, { session: [] }],
        },
      },
      '/api/v1/proposals': {
        get: {
          tags: ['Proposal'],
          summary: 'List proposals',
          operationId: 'listProposals',
          responses: { '200': { description: 'List of proposals' } },
          security: [{ apiKey: [] }, { session: [] }],
        },
      },
      '/api/v1/proposal/{proposalId}/send': {
        post: {
          tags: ['Proposal'],
          summary: 'Send proposal via email',
          operationId: 'sendProposal',
          parameters: [
            {
              name: 'proposalId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['recipientEmails'],
                  properties: {
                    recipientEmails: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 10,
                      items: { type: 'string', format: 'email' },
                    },
                    subject: { type: 'string', minLength: 5, maxLength: 200 },
                    message: { type: 'string', maxLength: 2000 },
                    scheduleAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Proposal sent successfully' },
            '404': { description: 'Proposal not found' },
          },
          security: [{ apiKey: [] }, { session: [] }],
        },
      },
      '/api/public/audit/{token}': {
        get: {
          tags: ['Public'],
          summary: 'Get public audit report',
          operationId: 'getPublicAudit',
          parameters: [
            {
              name: 'token',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Public audit token',
            },
          ],
          responses: {
            '200': { description: 'Audit report' },
            '404': { description: 'Audit not found' },
          },
        },
      },
      '/api/health': {
        get: {
          tags: ['Admin'],
          summary: 'Health check',
          operationId: 'healthCheck',
          responses: {
            '200': {
              description: 'Service healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                      timestamp: { type: 'string', format: 'date-time' },
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Audit: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            businessName: { type: 'string' },
            websiteUrl: { type: 'string', format: 'uri' },
            status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
            findingsCount: { type: 'integer' },
            scores: {
              type: 'object',
              properties: {
                accessibility: { type: 'integer', minimum: 0, maximum: 100 },
                seo: { type: 'integer', minimum: 0, maximum: 100 },
                performance: { type: 'integer', minimum: 0, maximum: 100 },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Proposal: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            auditId: { type: 'string', format: 'uuid' },
            status: { $ref: '#/components/schemas/ProposalStatus' },
            tier: { $ref: '#/components/schemas/ProposalTier' },
            totalValue: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            sentAt: { type: 'string', format: 'date-time', nullable: true },
            viewedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ProposalStatus: {
          type: 'string',
          enum: [
            'DRAFT',
            'PENDING',
            'SENT',
            'VIEWED',
            'ACCEPTED',
            'REJECTED',
            'EXPIRED',
            'CLOSED_WON',
            'CLOSED_LOST',
          ],
        },
        ProposalTier: {
          type: 'string',
          enum: ['starter', 'professional', 'enterprise', 'custom'],
        },
        Finding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            auditId: { type: 'string', format: 'uuid' },
            category: { $ref: '#/components/schemas/FindingCategory' },
            severity: { $ref: '#/components/schemas/FindingSeverity' },
            title: { type: 'string' },
            description: { type: 'string' },
            recommendation: { type: 'string' },
            evidence: { type: 'array', items: { type: 'string' } },
          },
        },
        FindingSeverity: {
          type: 'string',
          enum: ['critical', 'major', 'minor', 'info'],
        },
        FindingCategory: {
          type: 'string',
          enum: ['accessibility', 'seo', 'performance', 'security', 'ux', 'content', 'technical'],
        },
      },
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API key for server-to-server authentication',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Bearer token (API key or session token)',
        },
        session: {
          type: 'apiKey',
          name: 'authjs.session-token',
          in: 'cookie',
          description: 'Session cookie for dashboard users',
        },
      },
    },
    security: [{ apiKey: [] }],
  };

  return spec;
}

export async function GET(): Promise<NextResponse> {
  const spec = generateOpenApiSpec();

  return NextResponse.json(spec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
