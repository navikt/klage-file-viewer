import type { Context, Span, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { name as packageName, version as packageVersion } from '@package';

interface OtelResolved {
  tracer: Tracer;
  getActiveContext: () => Context;
  ERROR: SpanStatusCode;
}

let cached: OtelResolved | null = null;
let resolveAttempted = false;

const resolveOtel = async (): Promise<OtelResolved | null> => {
  if (resolveAttempted) {
    return cached;
  }

  resolveAttempted = true;

  try {
    const api = await import('@opentelemetry/api');
    cached = {
      tracer: api.trace.getTracer(packageName, packageVersion),
      getActiveContext: () => api.context.active(),
      ERROR: api.SpanStatusCode.ERROR,
    };
  } catch {
    cached = null;
  }

  return cached;
};

// Eagerly attempt to resolve OTel so it's ready when needed.
const otelPromise = resolveOtel();

type SpanCallback<T> = (span?: Span) => T;

/**
 * Start a span with the given name and execute the callback.
 *
 * If `@opentelemetry/api` is not installed or no `TracerProvider` is registered,
 * the callback is executed without a span.
 *
 * @param name - The span name.
 * @param traceName - Optional `component.instance` attribute value for differentiating multiple instances.
 * @param fn - Callback receiving the span (or `undefined` when OTel is unavailable).
 */
export const startSpan = async <T>(name: string, traceName: string | undefined, fn: SpanCallback<T>): Promise<T> => {
  // Capture the active context now, synchronously, before any `await` breaks the StackContextManager's context chain.
  const parentContext = cached?.getActiveContext();

  const otel = await otelPromise;

  if (otel === null || parentContext === undefined) {
    return fn();
  }

  return otel.tracer.startActiveSpan(name, {}, parentContext, (span: Span) => {
    if (traceName !== undefined) {
      span.setAttribute('component.instance', traceName);
    }

    try {
      return fn(span);
    } catch (error) {
      span.setStatus({ code: otel.ERROR });
      span.recordException(error instanceof Error ? error : String(error));

      throw error;
    } finally {
      span.end();
    }
  });
};

/**
 * Start an async span with the given name and execute the callback.
 *
 * If `@opentelemetry/api` is not installed or no `TracerProvider` is registered,
 * the callback is executed without a span.
 *
 * @param name - The span name.
 * @param traceName - Optional `component.instance` attribute value for differentiating multiple instances.
 * @param fn - Async callback receiving the span (or `undefined` when OTel is unavailable).
 */
export const startAsyncSpan = async <T>(
  name: string,
  traceName: string | undefined,
  fn: SpanCallback<Promise<T>>,
): Promise<T> => {
  // Capture the active context now, synchronously, before any `await` breaks the StackContextManager's context chain.
  const parentContext = cached?.getActiveContext();

  const otel = await otelPromise;

  if (otel === null || parentContext === undefined) {
    return fn();
  }

  return otel.tracer.startActiveSpan(name, {}, parentContext, async (span: Span) => {
    if (traceName !== undefined) {
      span.setAttribute('component.instance', traceName);
    }

    try {
      return await fn(span);
    } catch (error) {
      span.setStatus({ code: otel.ERROR });
      span.recordException(error instanceof Error ? error : String(error));

      throw error;
    } finally {
      span.end();
    }
  });
};
