import pino from 'pino';

const isServer = typeof window === 'undefined';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
  base: { service: 'cre-dealcard' },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

export function createModuleLogger(module: string) {
  return logger.child({ module });
}
