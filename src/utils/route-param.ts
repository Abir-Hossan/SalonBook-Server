import type { Request } from 'express';
import { AppError } from './errors';

/** Read a route parameter after validation, with a runtime guard for strict Express typings. */
export const getRouteParam = (req: Request, name: string): string => {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(400, `Missing route parameter: ${name}.`, 'INVALID_ROUTE_PARAMETER');
  }
  return value;
};
