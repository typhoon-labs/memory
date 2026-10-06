// JSON logs on stdout, one object per line. Every line written while a request
// is being handled carries that request's trace_id and span_id.
import { currentSpan } from './tracing.js';

const base = {};

export function configureLog(fields) {
  Object.assign(base, fields);
}

function write(level, msg, fields = {}) {
  const span = currentSpan();
  const line = { ts: new Date().toISOString(), level, ...base, msg, ...fields };
  if (span) {
    line.trace_id = span.traceId;
    line.span_id = span.spanId;
  }
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};

export function errorFields(err) {
  return {
    error_type: err?.name ?? 'Error',
    error: String(err?.message ?? err),
    ...(err?.cause?.code ? { cause: err.cause.code } : {}),
    stack: err?.stack,
  };
}
