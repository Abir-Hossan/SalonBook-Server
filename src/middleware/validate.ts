import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/errors';

type Target = 'body' | 'query' | 'params';
export const validate = (schema: ZodType, target: Target): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse(req[target]);
  if (!parsed.success) {
    next(new AppError(400, 'Request validation failed.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))));
    return;
  }
  Object.defineProperty(req, target, { configurable: true, enumerable: true, writable: true, value: parsed.data });
  next();
};
