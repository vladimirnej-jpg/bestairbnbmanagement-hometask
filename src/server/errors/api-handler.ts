import 'server-only';

import { ZodError } from 'zod';

import { ApplicationError } from './application-error';
import { getLogger, getRequestId } from '../runtime/logger';

type ApiResult = Response | Promise<Response>;

interface ErrorResponseBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

interface ErrorEnvelope {
  readonly statusCode: number;
  readonly error: ErrorResponseBody;
  readonly requestId: string;
  readonly timestamp: string;
}

export function withApiHandler(
  handler: (request: Request) => ApiResult,
): (request: Request) => Promise<Response>;
export function withApiHandler<TContext>(
  handler: (request: Request, context: TContext) => ApiResult,
): (request: Request, context: TContext) => Promise<Response>;
export function withApiHandler<TContext>(
  handler: (request: Request, context?: TContext) => ApiResult,
): (request: Request, context?: TContext) => Promise<Response> {
  return async (request: Request, context?: TContext): Promise<Response> => {
    const requestId = getRequestId(request);
    const logger = getLogger().child({
      correlationId: requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      requestId,
    });

    try {
      const response = await handler(request, context as TContext);
      response.headers.set('x-request-id', requestId);
      return response;
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      logger.error(
        { err: error, code: normalized.error.code, statusCode: normalized.statusCode },
        'API request failed',
      );
      const envelope: ErrorEnvelope = {
        statusCode: normalized.statusCode,
        error: normalized.error,
        requestId,
        timestamp: new Date().toISOString(),
      };
      return Response.json(envelope, {
        status: normalized.statusCode,
        headers: { 'x-request-id': requestId },
      });
    }
  };
}

function normalizeError(error: unknown): {
  readonly statusCode: number;
  readonly error: ErrorResponseBody;
} {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    };
  }

  if (error instanceof ApplicationError) {
    return {
      statusCode: error.status,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      statusCode: 400,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    };
  }

  return {
    statusCode: 500,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
}
