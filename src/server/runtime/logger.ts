import pino, { type Logger } from 'pino';
import { randomUUID } from 'node:crypto';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

let applicationLogger: Logger | undefined;

export function getLogger(): Logger {
  applicationLogger ??= pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'authorization',
        'cookie',
        'headers.authorization',
        'headers.cookie',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  });
  return applicationLogger;
}

export function getRequestId(request: Request): string {
  const requestedId =
    request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id');
  return requestedId !== null && requestIdPattern.test(requestedId) ? requestedId : randomUUID();
}
