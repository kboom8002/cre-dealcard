import pino, { Logger as PinoLogger } from 'pino';

const isServer = typeof window === 'undefined';

export interface ModuleLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  child: (bindings: Record<string, unknown>) => ModuleLogger;
}

const REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'secret',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.authorization',
  'cookie',
  'headers.authorization',
  'headers.cookie',
];

function formatArgs(args: any[]): [Record<string, unknown>, string] | any[] {
  if (args.length === 0) return [];

  // Case 1: First argument is an Error
  if (args[0] instanceof Error) {
    const err = args[0];
    const msg = typeof args[1] === 'string' ? args[1] : err.message;
    const rest = typeof args[1] === 'string' ? args.slice(2) : args.slice(1);
    const payload: Record<string, unknown> = { err };
    if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) {
      Object.assign(payload, rest[0]);
    } else if (rest.length > 0) {
      payload.data = rest.length === 1 ? rest[0] : rest;
    }
    return [payload, msg];
  }

  // Case 2: First argument is a string message
  if (typeof args[0] === 'string') {
    const msg = args[0];
    if (args.length === 1) {
      return [msg];
    }

    // Check if any subsequent argument is an Error
    const errIndex = args.findIndex((a, idx) => idx > 0 && a instanceof Error);
    if (errIndex > 0) {
      const payload: Record<string, unknown> = { err: args[errIndex] };
      const otherArgs = args.filter((_, idx) => idx !== 0 && idx !== errIndex);
      if (otherArgs.length === 1 && typeof otherArgs[0] === 'object' && otherArgs[0] !== null && !Array.isArray(otherArgs[0])) {
        Object.assign(payload, otherArgs[0]);
      } else if (otherArgs.length > 0) {
        payload.data = otherArgs.length === 1 ? otherArgs[0] : otherArgs;
      }
      return [payload, msg];
    }

    // If second arg is a plain object, merge it as the Pino payload
    const rest = args.slice(1);
    if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null && !Array.isArray(rest[0])) {
      return [rest[0], msg];
    }

    return [{ data: rest.length === 1 ? rest[0] : rest }, msg];
  }

  // Case 3: First argument is an object payload
  if (typeof args[0] === 'object' && args[0] !== null) {
    if (typeof args[1] === 'string') {
      return [args[0], args[1]];
    }
    return [args[0]];
  }

  return args;
}

// Browser fallback logger (safe for SSR client hydration & edge bundles)
function createBrowserLogger(moduleName: string): ModuleLogger {
  return {
    info: (...args: any[]) => console.info(`[${moduleName}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${moduleName}]`, ...args),
    error: (...args: any[]) => console.error(`[${moduleName}]`, ...args),
    debug: (...args: any[]) => console.debug(`[${moduleName}]`, ...args),
    child: (bindings: Record<string, unknown>) =>
      createBrowserLogger(`${moduleName}:${(bindings.module as string) || Object.values(bindings).join(',')}`),
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

  const child = pinoLoggerInstance.child({ module });

  return {
    info: (...args: any[]) => (child.info as any)(...formatArgs(args)),
    warn: (...args: any[]) => (child.warn as any)(...formatArgs(args)),
    error: (...args: any[]) => (child.error as any)(...formatArgs(args)),
    debug: (...args: any[]) => (child.debug as any)(...formatArgs(args)),
    child: (bindings: Record<string, unknown>) => {
      const subChild = child.child(bindings);
      return {
        info: (...args: any[]) => (subChild.info as any)(...formatArgs(args)),
        warn: (...args: any[]) => (subChild.warn as any)(...formatArgs(args)),
        error: (...args: any[]) => (subChild.error as any)(...formatArgs(args)),
        debug: (...args: any[]) => (subChild.debug as any)(...formatArgs(args)),
        child: (subBindings: Record<string, unknown>) => subChild.child(subBindings) as unknown as ModuleLogger,
      };
    },
  };
}
