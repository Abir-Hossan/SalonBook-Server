import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Schema, model, type Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { UserModel } from '../../database/models/user.model';
import { authenticate, type PrincipalResolver } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/errors';
import { googleRoutes } from './google.routes';
import { success } from '../../utils/http';
import { getBetterAuth } from './better-auth';

const cookieName = 'salonbook_session';
const cookieSettings = { httpOnly: true, sameSite: 'lax' as const, secure: env.NODE_ENV === 'production', path: '/' };
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
const sessionSchema = new Schema<{ _id: string; userId: Types.ObjectId; expiresAt: Date }>({
  _id: String,
  userId: { type: Schema.Types.ObjectId, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: 'CustomerSessions', versionKey: false });
export const SessionModel = model('CustomerSession', sessionSchema);

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const credentials = z.object({ email, password: z.string().min(1).max(128), remember: z.boolean().optional() }).strict();
const registration = credentials.extend({
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/),
  acceptedTerms: z.literal(true),
}).strict();

function sessionToken(req: Request) {
  return req.headers.cookie?.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}

async function issueSession(req: Request, res: Response, userId: Types.ObjectId, remember: boolean) {
  const previous = sessionToken(req);
  if (previous && /^[a-f0-9]{64}$/.test(previous)) await SessionModel.deleteOne({ _id: hashToken(previous) });
  const token = randomBytes(32).toString('hex');
  const maxAge = (remember ? 30 * 24 : 12) * 60 * 60 * 1000;
  await SessionModel.create({ _id: hashToken(token), userId, expiresAt: new Date(Date.now() + maxAge) });
  res.cookie(cookieName, token, remember ? { ...cookieSettings, maxAge } : cookieSettings);
}

export const mongoPrincipalResolver: PrincipalResolver = async (req) => {
  const auth = getBetterAuth();
  if (auth) {
    const session = await auth.api.getSession({ headers: auth.headers(req.headers), query: { disableRefresh: true } });
    if (session) {
      const user = await UserModel.findById(session.user.id).lean();
      return user ? { id: String(user._id), role: user.role, isBlocked: user.isBlocked, email: user.email } : null;
    }
  }
  const token = sessionToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await SessionModel.findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await UserModel.findById(session.userId).lean();
  return user ? { id: String(user._id), role: user.role, isBlocked: user.isBlocked, email: user.email } : null;
};

export function authRoutes() {
  const routes = Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
  routes.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  routes.post('/register', limit, validate(registration, 'body'), asyncHandler(async (req, res) => {
    await credentialResponse(req, res, true);
  }));
  routes.post('/sign-in', limit, validate(credentials, 'body'), asyncHandler(async (req, res) => {
    await credentialResponse(req, res, false);
  }));
  routes.get('/me', authenticate(mongoPrincipalResolver), asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.principal!.id).lean();
    if (!user) throw new AppError(401, 'Authentication is required.', 'UNAUTHENTICATED');
    success(res, 'Account loaded.', { id: String(user._id), name: user.name, email: user.email, image: user.image, role: user.role });
  }));
  routes.post('/sign-out', asyncHandler(async (req, res) => {
    await revokeLegacySession(req);
    const auth = getBetterAuth();
    if (auth) {
      const result = await auth.api.signOut({ headers: auth.headers(req.headers), asResponse: true });
      if (!result.ok) throw new AppError(500, 'Sign-out could not be completed.', 'SIGN_OUT_FAILED');
      forwardCookies(result, res);
    }
    res.clearCookie(cookieName, cookieSettings).status(204).end();
  }));
  googleRoutes(routes, issueSession);
  return routes;
}

export async function revokeLegacySession(req: Request) {
  const token = sessionToken(req);
  if (token && /^[a-f0-9]{64}$/.test(token)) await SessionModel.deleteOne({ _id: hashToken(token) });
}

function forwardCookies(source: globalThis.Response, res: Response) {
  for (const value of source.headers.getSetCookie()) res.append('Set-Cookie', value);
}

async function credentialResponse(req: Request, res: Response, register: boolean) {
  const auth = getBetterAuth();
  if (!auth) throw new AppError(503, 'Authentication is unavailable.', 'AUTH_UNAVAILABLE');

  const headers = auth.headers(req.headers);
  const { email, password, name, acceptedTerms, remember } = req.body;
  const result = register
    ? await auth.api.signUpEmail({ headers, body: { email, password, name, acceptedTerms, rememberMe: false }, asResponse: true })
    : await auth.api.signInEmail({ headers, body: { email, password, rememberMe: remember === true }, asResponse: true });
  if (!result.ok) {
    const error = z.object({ code: z.string().optional() }).parse(await result.json());
    if (register && (error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ||
        await UserModel.exists({ email }))) {
      throw new AppError(409, 'An account already uses that email.', 'EMAIL_CONFLICT');
    }
    if (error.code === 'ACCOUNT_BLOCKED') throw new AppError(403, 'This account is blocked.', 'ACCOUNT_BLOCKED');
    if (result.status === 401) throw new AppError(401, 'The email or password is incorrect.', 'INVALID_CREDENTIALS');
    if (result.status >= 500) throw new AppError(500, 'Authentication could not be completed.', 'AUTH_FAILED');
    throw new AppError(400, 'The authentication request could not be completed.', 'INVALID_AUTH_REQUEST');
  }

  const { user: identity } = z.object({ user: z.object({ id: z.string() }) }).parse(await result.json());
  const user = await UserModel.findById(identity.id).select('role isBlocked').lean();
  if (!user) throw new AppError(500, 'The account could not be loaded.', 'AUTH_FAILED');
  if (user.isBlocked) throw new AppError(403, 'This account is blocked.', 'ACCOUNT_BLOCKED');
  await revokeLegacySession(req);
  forwardCookies(result, res);
  res.clearCookie(cookieName, cookieSettings);
  success(res, register ? 'Account created.' : 'Signed in.', { id: String(user._id), role: user.role }, register ? 201 : 200);
}
