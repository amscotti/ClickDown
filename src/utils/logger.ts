import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Structured logger (pino). JSON lines to stdout — fully local, no external service.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  base: { service: 'clickdown' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export function logError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
  logger.error({ scope, err, ...extra }, err.message);
}

export function logInfo(scope: string, message: string, extra?: Record<string, unknown>): void {
  logger.info({ scope, ...extra }, message);
}

export function logWarn(scope: string, message: string, extra?: Record<string, unknown>): void {
  logger.warn({ scope, ...extra }, message);
}
