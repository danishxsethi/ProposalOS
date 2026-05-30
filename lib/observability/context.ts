import { AsyncLocalStorage } from 'async_hooks';

import type { NextResponse } from 'next/server';

import { buildTraceparent, generateCorrelationId, generateSpanId, generateTraceId, resolveTracingHeaders } from './ids';

export interface ObservabilityContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  traceparent: string;
  service: string;
  method?: string;
  path?: string;
  tenantId?: string;
  actorId?: string;
  auditId?: string;
  proposalId?: string;
  workflow?: string;
}

const OBSERVABILITY_SERVICE_NAME = 'proposal-os';
const globalForObservabilityStorage = globalThis as unknown as {
  observabilityStorage: AsyncLocalStorage<ObservabilityContext> | undefined;
};

const observabilityStorage =
  globalForObservabilityStorage.observabilityStorage ?? new AsyncLocalStorage<ObservabilityContext>();

if (process.env.NODE_ENV !== 'production') {
  globalForObservabilityStorage.observabilityStorage = observabilityStorage;
}

export function getObservabilityContext(): ObservabilityContext | undefined {
  return observabilityStorage.getStore();
}

export function getCorrelationId(): string {
  return getObservabilityContext()?.correlationId || generateCorrelationId();
}

export function getTraceId(): string {
  return getObservabilityContext()?.traceId || generateTraceId();
}

export function runWithObservabilityContext<T>(
  context: Partial<ObservabilityContext>,
  fn: () => T
): T {
  const parent = getObservabilityContext();
  const resolvedTraceId = context.traceId || parent?.traceId || generateTraceId();
  const resolvedSpanId = context.spanId || generateSpanId();

  const nextContext: ObservabilityContext = {
    correlationId: context.correlationId || parent?.correlationId || generateCorrelationId(),
    traceId: resolvedTraceId,
    spanId: resolvedSpanId,
    traceparent: context.traceparent || buildTraceparent(resolvedTraceId, resolvedSpanId),
    service: context.service || parent?.service || OBSERVABILITY_SERVICE_NAME,
    method: context.method ?? parent?.method,
    path: context.path ?? parent?.path,
    tenantId: context.tenantId ?? parent?.tenantId,
    actorId: context.actorId ?? parent?.actorId,
    auditId: context.auditId ?? parent?.auditId,
    proposalId: context.proposalId ?? parent?.proposalId,
    workflow: context.workflow ?? parent?.workflow,
  };

  return observabilityStorage.run(nextContext, fn);
}

export function withChildObservabilityContext<T>(
  updates: Partial<ObservabilityContext>,
  fn: () => T
): T {
  const current = getObservabilityContext();
  return runWithObservabilityContext({ ...current, ...updates }, fn);
}

export function createObservabilityContextFromRequest(
  req: Request,
  overrides: Partial<ObservabilityContext> = {}
): ObservabilityContext {
  const url = new URL(req.url);
  const tracing = resolveTracingHeaders({
    correlationId: req.headers.get('x-correlation-id'),
    traceId: req.headers.get('x-trace-id'),
    traceparent: req.headers.get('traceparent'),
  });

  return {
    correlationId: tracing.correlationId,
    traceId: tracing.traceId,
    spanId: tracing.spanId,
    traceparent: tracing.traceparent,
    service: OBSERVABILITY_SERVICE_NAME,
    method: req.method,
    path: url.pathname,
    tenantId: req.headers.get('x-tenant-id') || undefined,
    ...overrides,
  };
}

export function applyObservabilityHeaders(response: NextResponse | Response): void {
  const context = getObservabilityContext();
  if (!context) return;

  response.headers.set('X-Correlation-Id', context.correlationId);
  response.headers.set('X-Trace-Id', context.traceId);
  response.headers.set('traceparent', context.traceparent);
}