/**
 * lib/observability/otel.ts
 *
 * OpenTelemetry SDK Bootstrap for ProposalOS
 *
 * This module initializes the OpenTelemetry SDK with:
 * - HTTP instrumentation for automatic request tracing
 * - PostgreSQL instrumentation for database query tracing
 * - OTLP exporter for GCP Cloud Trace compatibility
 * - Resource attributes for service identification
 *
 * Usage: Import this module in instrumentation.ts to enable distributed tracing.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as HTTPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

import { logger } from '@/lib/logger';

// Environment configuration
const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false';
const OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'proposal-os';
const OTEL_COLLECTOR_URL = process.env.OTEL_COLLECTOR_URL; // gRPC endpoint for OTLP
const OTEL_EXPORTER_MODE = process.env.OTEL_EXPORTER_MODE || 'grpc'; // 'grpc' or 'http'
const OTEL_CONSOLE_EXPORT = process.env.OTEL_CONSOLE_EXPORT === 'true';

// GCP Cloud Trace specific configuration
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const isGCP = !!GCP_PROJECT_ID || process.env.K_SERVICE; // K_SERVICE is set on Cloud Run

let sdk: NodeSDK | undefined;

/**
 * Initialize the OpenTelemetry SDK
 * Call this function at application startup to enable distributed tracing.
 */
export function initializeOpenTelemetry(): void {
  if (!OTEL_ENABLED) {
    logger.info('[OpenTelemetry] Disabled via OTEL_ENABLED=false');
    return;
  }

  try {
    // Build resource with service identification
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: OTEL_SERVICE_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      ...(GCP_PROJECT_ID && {
        ['gcp.project_id']: GCP_PROJECT_ID,
      }),
      ...(process.env.K_SERVICE && {
        ['gcp.cloud_run.service']: process.env.K_SERVICE,
        ['gcp.cloud_run.revision']: process.env.K_REVISION,
      }),
    });

    // Configure trace exporter based on mode and environment
    let traceExporter: OTLPTraceExporter | HTTPTraceExporter | ConsoleSpanExporter;

    if (OTEL_CONSOLE_EXPORT) {
      traceExporter = new ConsoleSpanExporter();
      logger.info('[OpenTelemetry] Using console exporter for development');
    } else if (OTEL_COLLECTOR_URL) {
      if (OTEL_EXPORTER_MODE === 'http') {
        traceExporter = new HTTPTraceExporter({
          url: OTEL_COLLECTOR_URL,
        });
        logger.info({ url: OTEL_COLLECTOR_URL }, '[OpenTelemetry] Using HTTP OTLP exporter');
      } else {
        traceExporter = new OTLPTraceExporter({
          url: OTEL_COLLECTOR_URL,
        });
        logger.info({ url: OTEL_COLLECTOR_URL }, '[OpenTelemetry] Using gRPC OTLP exporter');
      }
    } else if (isGCP) {
      // On GCP, use gRPC exporter with default endpoint for Cloud Trace
      traceExporter = new OTLPTraceExporter();
      logger.info('[OpenTelemetry] Using default gRPC exporter for GCP Cloud Trace');
    } else {
      // Default to console exporter in development
      traceExporter = new ConsoleSpanExporter();
      logger.info('[OpenTelemetry] No collector URL configured, using console exporter');
    }

    // Initialize the SDK with auto-instrumentations
    sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      instrumentations: [
        getNodeAutoInstrumentations({
          // HTTP instrumentation
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            requireParentforSpans: false,
            ignoreIncomingRequestHook: (request: any) => {
              // Ignore health checks and static assets
              const url = request.url;
              if (!url) return false;
              const ignoredPaths = [
                '/api/health',
                '/api/ping',
                '/_next/static',
                '/_next/image',
                '/favicon.ico',
                '/robots.txt',
                '/sitemap.xml',
              ];
              return ignoredPaths.some((path) => url.startsWith(path));
            },
          },
          // PostgreSQL instrumentation
          '@opentelemetry/instrumentation-pg': {
            enabled: true,
            requireParentforSpans: false,
            // Don't include query parameters in spans to avoid leaking sensitive data
            excludeQueryParameters: true,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    logger.info('[OpenTelemetry] SDK initialized successfully');

    // Graceful shutdown on process exit
    process.on('SIGTERM', async () => {
      await shutdownOpenTelemetry();
    });

    process.on('SIGINT', async () => {
      await shutdownOpenTelemetry();
    });
  } catch (error) {
    logger.error({ error }, '[OpenTelemetry] Failed to initialize SDK');
    // Don't throw - allow the application to start without tracing
  }
}

/**
 * Shutdown the OpenTelemetry SDK gracefully
 * Call this before application exit to flush pending spans.
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    logger.info('[OpenTelemetry] Shutting down SDK...');
    await sdk.shutdown();
    logger.info('[OpenTelemetry] SDK shutdown complete');
  } catch (error) {
    logger.error({ error }, '[OpenTelemetry] SDK shutdown failed');
  }
}

/**
 * Get the current trace ID from the active context
 * Useful for manual trace correlation in logs.
 */
export function getCurrentTraceId(): string | undefined {
  try {
    const api = require('@opentelemetry/api');
    const span = api.trace.getSpan(api.context.active());
    return span?.spanContext().traceId;
  } catch {
    return undefined;
  }
}

/**
 * Get the current span ID from the active context
 */
export function getCurrentSpanId(): string | undefined {
  try {
    const api = require('@opentelemetry/api');
    const span = api.trace.getSpan(api.context.active());
    return span?.spanContext().spanId;
  } catch {
    return undefined;
  }
}
