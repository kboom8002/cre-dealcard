import pino from 'pino';

const isServer = typeof window === 'undefined';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
  base: { service: 'cre-dealcard' },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

export function createModuleLogger(module: string) {
  const child = logger.child({ module });
  
  const formatArgs = (args: any[]) => {
    if (args.length === 0) return [];
    if (typeof args[0] === 'string' && args.length > 1) {
      const msg = args[0];
      const rest = args.slice(1);
      // If it's a format string (e.g. %s), pino handles it. But TS still complains if we don't cast to any.
      // We will pass object first for structured logging if we want, but simple passthrough with type evasion is enough.
      return [{ data: rest.length === 1 ? rest[0] : rest }, msg];
    }
    return args;
  };

  return {
    info: (...args: any[]) => (child.info as any)(...formatArgs(args)),
    warn: (...args: any[]) => (child.warn as any)(...formatArgs(args)),
    error: (...args: any[]) => (child.error as any)(...formatArgs(args)),
    debug: (...args: any[]) => (child.debug as any)(...formatArgs(args)),
    child: (bindings: any) => child.child(bindings),
  };
}
