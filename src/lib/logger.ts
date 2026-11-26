import pino, { Logger as PinoLogger } from 'pino';

const isServer = typeof window === 'undefined';

export interface ModuleLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  child: (bindings: Record<string, unknown>) => ModuleLogger;
}

export interface RequestLogContext {
  requestId?: string;
  route?: string;
  userId?: string;
}

let contextProvider: (() => RequestLogContext | undefined) | undefined;

export function registerRequestContextProvider(
  fn: () => { requestId?: string; route?: string; userId?: string } | undefined,
): void {
  contextProvider = fn;
}

export function getRegisteredRequestContext(): RequestLogContext | undefined {
  try {
    return contextProvider?.();
  } catch {
    return undefined;
  }
}

const REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'secret',
  'email',
  'phone',
  'mobile',
  'resident',
  'ssn',
  'to',
  'address',
  'raw_address',
  'subscriber_email',
  'subscriber_phone',
  'requester_email',
  'requester_phone',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.authorization',
  '*.email',
  '*.phone',
  '*.mobile',
  '*.resident',
  '*.ssn',
  '*.to',
  '*.address',
  '*.raw_address',
  '*.subscriber_email',
  '*.subscriber_phone',
  '*.requester_email',
  '*.requester_phone',
  'cookie',
  'headers.authorization',
  'headers.cookie',
];

const SENSITIVE_KEY_RE =
  /email|phone|mobile|token|secret|password|authorization|cookie|resident|ssn/i;
const EXACT_SENSITIVE_KEYS = new Set([
  'to',
  'address',
  'raw_address',
  'apikey',
  'api_key',
]);
const INLINE_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const INLINE_KR_PHONE_RE =
  /(?<!\d)(?:\+82[-\s]?10|01[016789])[-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/g;

export function redactStringPii(input: string): string {
  return input
    .replace(INLINE_EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(INLINE_KR_PHONE_RE, '[REDACTED_PHONE]');
}

export function redactPiiDeep(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactStringPii(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (depth > 5) {
    return '[REDACTED]';
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (value instanceof Error) {
    const scrubbedErr = new Error(redactStringPii(value.message || ''));
    scrubbedErr.name = value.name || 'Error';
    if (value.stack) {
      scrubbedErr.stack = redactStringPii(value.stack);
    }
    const extraRecord = scrubbedErr as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(value)) {
      const lowerK = k.toLowerCase();
      extraRecord[k] =
        SENSITIVE_KEY_RE.test(k) || EXACT_SENSITIVE_KEYS.has(lowerK)
          ? '[REDACTED]'
          : redactPiiDeep(v, depth + 1, seen);
    }
    return scrubbedErr;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactPiiDeep(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lowerK = k.toLowerCase();
    if (SENSITIVE_KEY_RE.test(k) || EXACT_SENSITIVE_KEYS.has(lowerK)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactPiiDeep(v, depth + 1, seen);
    }
  }
  return out;
}

function formatArgs(args: any[]): [Record<string, unknown>, string] | any[] {
  if (args.length === 0) return [];

  // Case 1: First argument is an Error
  if (args[0] instanceof Error) {
    const err = redactPiiDeep(args[0]) as Error;
    const msg =
      typeof args[1] === 'string'
        ? redactStringPii(args[1])
        : err.message;
    const rest = typeof args[1] === 'string' ? args.slice(2) : args.slice(1);
    const payload: Record<string, unknown> = { err };
    if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) {
      Object.assign(payload, redactPiiDeep(rest[0]) as Record<string, unknown>);
    } else if (rest.length > 0) {
      payload.data = redactPiiDeep(rest.length === 1 ? rest[0] : rest);
    }
    return [payload, msg];
  }

  // Case 2: First argument is a string message
  if (typeof args[0] === 'string') {
    const msg = redactStringPii(args[0]);
    if (args.length === 1) {
      return [msg];
    }

    // Check if any subsequent argument is an Error
    const errIndex = args.findIndex((a, idx) => idx > 0 && a instanceof Error);
    if (errIndex > 0) {
      const payload: Record<string, unknown> = {
        err: redactPiiDeep(args[errIndex]),
      };
      const otherArgs = args.filter((_, idx) => idx !== 0 && idx !== errIndex);
      if (otherArgs.length === 1 && typeof otherArgs[0] === 'object' && otherArgs[0] !== null && !Array.isArray(otherArgs[0])) {
        Object.assign(
          payload,
          redactPiiDeep(otherArgs[0]) as Record<string, unknown>
        );
      } else if (otherArgs.length > 0) {
        payload.data = redactPiiDeep(
          otherArgs.length === 1 ? otherArgs[0] : otherArgs
        );
      }
      return [payload, msg];
    }

    // If second arg is a plain object, merge it as the Pino payload
    const rest = args.slice(1);
    if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) {
      return [redactPiiDeep(rest[0]) as Record<string, unknown>, msg];
    }

    return [{ data: redactPiiDeep(rest.length === 1 ? rest[0] : rest) }, msg];
  }

  // Case 3: First argument is an object payload
  if (typeof args[0] === 'object' && args[0] !== null) {
    const cleanObj = redactPiiDeep(args[0]) as Record<string, unknown>;
    if (typeof args[1] === 'string') {
      return [cleanObj, redactStringPii(args[1])];
    }
    return [cleanObj];
  }

  return args.map((item) => redactPiiDeep(item));
}

// Browser fallback logger (safe for SSR client hydration & edge bundles)
function createBrowserLogger(moduleName: string): ModuleLogger {
  const safePrefix = `[${redactStringPii(moduleName)}]`;
  return {
    info: (...args: any[]) =>
      console.info(safePrefix, ...args.map((a) => redactPiiDeep(a))),
    warn: (...args: any[]) =>
      console.warn(safePrefix, ...args.map((a) => redactPiiDeep(a))),
    error: (...args: any[]) =>
      console.error(safePrefix, ...args.map((a) => redactPiiDeep(a))),
    debug: (...args: any[]) =>
      console.debug(safePrefix, ...args.map((a) => redactPiiDeep(a))),
    child: (bindings: Record<string, unknown>) => {
      const cleanBindings = redactPiiDeep(bindings) as Record<string, unknown>;
      return createBrowserLogger(
        `${moduleName}:${(cleanBindings.module as string) || Object.values(cleanBindings).join(',')}`
      );
    },
  };
}

function injectRequestContext(formatted: any[]): any[] {
  let ctx: RequestLogContext | undefined;
  try {
    ctx = contextProvider?.();
  } catch {
    return formatted;
  }

  if (!ctx || typeof ctx.requestId !== 'string' || ctx.requestId.length === 0) {
    return formatted;
  }

  const ctxFields: Record<string, unknown> = {
    requestId: redactStringPii(ctx.requestId),
  };
  if (typeof ctx.route === 'string' && ctx.route.length > 0) {
    ctxFields.route = redactStringPii(ctx.route);
  }
  if (typeof ctx.userId === 'string' && ctx.userId.length > 0) {
    ctxFields.userId = redactStringPii(ctx.userId);
  }

  if (formatted.length === 0) {
    return [ctxFields];
  }

  const first = formatted[0];
  if (typeof first === 'string') {
    return [ctxFields, ...formatted];
  }

  if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
    const firstObj = first as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...ctxFields, ...firstObj };
    if (firstObj.requestId === undefined && ctxFields.requestId !== undefined) {
      merged.requestId = ctxFields.requestId;
    }
    if (firstObj.route === undefined && ctxFields.route !== undefined) {
      merged.route = ctxFields.route;
    }
    if (firstObj.userId === undefined && ctxFields.userId !== undefined) {
      merged.userId = ctxFields.userId;
    }
    return [merged, ...formatted.slice(1)];
  }

  return [ctxFields, ...formatted];
}

function wrapPinoChild(pinoChild: PinoLogger): ModuleLogger {
  return {
    info: (...args: any[]) =>
      (pinoChild.info as any)(...injectRequestContext(formatArgs(args))),
    warn: (...args: any[]) =>
      (pinoChild.warn as any)(...injectRequestContext(formatArgs(args))),
    error: (...args: any[]) =>
      (pinoChild.error as any)(...injectRequestContext(formatArgs(args))),
    debug: (...args: any[]) =>
      (pinoChild.debug as any)(...injectRequestContext(formatArgs(args))),
    child: (bindings: Record<string, unknown>) =>
      wrapPinoChild(
        pinoChild.child(redactPiiDeep(bindings) as Record<string, unknown>)
      ),
  };
}

const pinoLoggerInstance: PinoLogger = isServer
  ? pino({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      ...(process.env.NODE_ENV !== 'production' && !process.env.VITEST && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
      base: { service: 'cre-dealcard' },
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
      formatters: {
        level: (label: string) => ({ level: label }),
      },
    })
  : (null as unknown as PinoLogger);

export const logger: PinoLogger = pinoLoggerInstance;

export function createModuleLogger(module: string): ModuleLogger {
  if (!isServer) {
    return createBrowserLogger(module);
  }

  return wrapPinoChild(pinoLoggerInstance.child({ module }));
}
