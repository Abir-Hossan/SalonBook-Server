import type { Request, RequestHandler } from 'express';
import type { Principal, Role } from '../types/domain';
import { AppError, AuthIntegrationPendingError } from '../utils/errors';

export type PrincipalResolver = (req: Request) => Promise<Principal | null>;
export const phase04PrincipalResolver: PrincipalResolver = async () => { throw new AuthIntegrationPendingError(); };

export const authenticate = (resolver: PrincipalResolver): RequestHandler => async (req, _res, next) => {
  try {
    const principal = await resolver(req);
    if (!principal) { next(new AppError(401, 'Authentication is required.', 'UNAUTHENTICATED')); return; }
    if (principal.isBlocked) { next(new AppError(403, 'This account is blocked.', 'ACCOUNT_BLOCKED')); return; }
    req.principal = principal;
    next();
  } catch (error) { next(error); }
};

export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.principal) { next(new AppError(401, 'Authentication is required.', 'UNAUTHENTICATED')); return; }
  if (!roles.includes(req.principal.role)) { next(new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN')); return; }
  next();
};

export const authenticateWhen = (predicate: (req: Request) => boolean, resolver: PrincipalResolver): RequestHandler => async (req, res, next) => {
  if (!predicate(req)) { next(); return; }
  await authenticate(resolver)(req, res, next);
};
export const authorizeWhen = (predicate: (req: Request) => boolean, ...roles: Role[]): RequestHandler => (req, res, next) => {
  if (!predicate(req)) { next(); return; }
  authorize(...roles)(req, res, next);
};
