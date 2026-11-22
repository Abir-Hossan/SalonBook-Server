import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';

export const notFound: RequestHandler = (req, _res, next) => next(new AppError(404, `Route ${req.method} ${req.path} was not found.`, 'ROUTE_NOT_FOUND'));
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (res.headersSent) { _next(error); return; }
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, message: 'Request validation failed.', errors: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }); return;
  }
  const normalized = error instanceof AppError ? error : null;
  const bodyError = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  const status = normalized?.statusCode ?? (bodyError === 'entity.too.large' ? 413 : bodyError === 'entity.parse.failed' ? 400 : 500);
  const message = normalized?.message ?? (status === 413 ? 'Request body is too large.' : status === 400 ? 'Request body contains invalid JSON.' : 'An unexpected server error occurred.');
  const code = normalized?.code ?? (status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_SERVER_ERROR');
  if (status >= 500) logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError', requestId: req.requestId, method: req.method, path: req.path }, 'Request failed');
  const errors = normalized?.details.length ? normalized.details : [{ code }];
  res.status(status).json({ success: false, message, errors });
};
