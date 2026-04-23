import { LogLevel, MastraLogger } from '@mastra/core/logger';
import { context as otelContext, trace } from '@opentelemetry/api';

const LEVEL_ORDER: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_ORDER) return env as LogLevel;
  return IS_PRODUCTION ? LogLevel.WARN : LogLevel.INFO;
}

function formatDev(level: string, name: string, message: string, context?: Record<string, unknown>): string {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const tag = level.toUpperCase().padEnd(5);
  const base = `${time} ${tag} [${name}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${safeStringify(context)}`;
  }
  return base;
}

function getTraceContext(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(otelContext.active());
  if (!span) return {};
  const spanContext = span.spanContext();
  // Only include if trace is valid (non-zero trace ID)
  if (spanContext.traceId === '00000000000000000000000000000000') return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  });
}

function formatProd(level: string, name: string, message: string, ctx?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    name,
    msg: message,
    ...getTraceContext(),
  };
  if (ctx && Object.keys(ctx).length > 0) {
    Object.assign(entry, ctx);
  }
  return safeStringify(entry);
}

function parseContext(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
    return args[0] as Record<string, unknown>;
  }
  return { args };
}

/**
 * Structured logger extending Mastra's MastraLogger for framework compatibility.
 * Outputs JSON lines in production, human-readable colored output in development.
 */
export class TyphoonLogger extends MastraLogger {
  private levelNum: number;
  private loggerName: string;

  constructor(options: { name: string; level?: LogLevel }) {
    const level = options.level ?? resolveLevel();
    super({ name: options.name, level });
    this.loggerName = options.name;
    this.levelNum = LEVEL_ORDER[level] ?? 1;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.levelNum > 0) return;
    const ctx = parseContext(args);
    const line = IS_PRODUCTION
      ? formatProd('debug', this.loggerName, message, ctx)
      : formatDev('debug', this.loggerName, message, ctx);
    console.debug(line);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.levelNum > 1) return;
    const ctx = parseContext(args);
    const line = IS_PRODUCTION
      ? formatProd('info', this.loggerName, message, ctx)
      : formatDev('info', this.loggerName, message, ctx);
    console.info(line);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.levelNum > 2) return;
    const ctx = parseContext(args);
    const line = IS_PRODUCTION
      ? formatProd('warn', this.loggerName, message, ctx)
      : formatDev('warn', this.loggerName, message, ctx);
    console.warn(line);
  }

  error(message: string, ...args: unknown[]): void {
    if (this.levelNum > 3) return;
    const ctx = parseContext(args);
    const line = IS_PRODUCTION
      ? formatProd('error', this.loggerName, message, ctx)
      : formatDev('error', this.loggerName, message, ctx);
    console.error(line);
  }
}

/** Create a named application logger. Reads LOG_LEVEL from environment. */
export function createAppLogger(name: string): TyphoonLogger {
  return new TyphoonLogger({ name });
}
