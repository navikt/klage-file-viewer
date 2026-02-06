import type { Span, Tracer } from '@opentelemetry/api';
import { name as packageName, version as packageVersion } from '@package';

let cachedTracer: Tracer | null = null;
let resolveAttempted = false;
let otelApi: typeof import('@opentelemetry/api') | null = null;

const resolveTracer = async (): Promise<Tracer | null> => {
  if (resolveAttempted) {
    return cachedTracer;
  }

  resolveAttempted = true;

  try {
    otelApi = await import('@opentelemetry/api');
    cachedTracer = otelApi.trace.getTracer(packageName, packageVersion);
  } catch {
    cachedTracer = null;
  }

  return cachedTracer;
};

// Eagerly attempt to resolve the tracer so it's ready when needed.
const tracerPromise = resolveTracer();

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
  const tracer = await tracerPromise;

  if (tracer === null) {
    return fn();
  }

  return tracer.startActiveSpan(name, (span: Span) => {
    if (traceName !== undefined) {
      span.setAttribute('component.instance', traceName);
    }

    try {
      return fn(span);
    } catch (error) {
      if (otelApi !== null) {
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR });
      }

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
  const tracer = await tracerPromise;

  if (tracer === null) {
    return fn();
  }

  return tracer.startActiveSpan(name, async (span: Span) => {
    if (traceName !== undefined) {
      span.setAttribute('component.instance', traceName);
    }

    try {
      return await fn(span);
    } catch (error) {
      if (otelApi !== null) {
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR });
      }

      span.recordException(error instanceof Error ? error : String(error));

      throw error;
    } finally {
      span.end();
    }
  });
};
