const TRACE_VERSION = '00';
const TRACE_FLAGS = '01';

function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(array);
  return Array.from(array, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function generateCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${randomHex(8)}`;
}

export function generateTraceId(): string {
  return randomHex(16);
}

export function generateSpanId(): string {
  return randomHex(8);
}

export function buildTraceparent(traceId: string = generateTraceId(), spanId: string = generateSpanId()): string {
  return `${TRACE_VERSION}-${traceId}-${spanId}-${TRACE_FLAGS}`;
}

export function parseTraceparent(traceparent?: string | null): {
  traceId: string;
  spanId: string;
  traceFlags: string;
} | null {
  if (!traceparent) return null;

  const match = traceparent.trim().match(/^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i);
  if (!match) return null;

  const [, , traceId, spanId, traceFlags] = match;
  if (!traceId || !spanId || !traceFlags) return null;

  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags: traceFlags.toLowerCase(),
  };
}

export function resolveTracingHeaders(input?: {
  correlationId?: string | null;
  traceId?: string | null;
  traceparent?: string | null;
}): {
  correlationId: string;
  traceId: string;
  spanId: string;
  traceparent: string;
} {
  const parsed = parseTraceparent(input?.traceparent);
  const traceId = input?.traceId || parsed?.traceId || generateTraceId();
  const spanId = parsed?.spanId || generateSpanId();

  return {
    correlationId: input?.correlationId || generateCorrelationId(),
    traceId,
    spanId,
    traceparent: buildTraceparent(traceId, spanId),
  };
}