import { createHash, randomBytes } from 'node:crypto';
import { type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { UserModel } from '../../database/models/user.model';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/errors';
import { success } from '../../utils/http';
import type { Types } from 'mongoose';
import { getBetterAuth } from './better-auth';

const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const callback = new URL('/salon-api/auth/google/callback', env.CLIENT_URL).href;
const cookie = 'salonbook_google';
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: env.NODE_ENV === 'production', path: '/salon-api/auth/google/callback' };

export function googleRoutes(router: Router, issueSession: (req: Request, res: Response, id: Types.ObjectId, remember: boolean) => Promise<void>) {
  router.get('/providers', (_req, res) => success(res, 'Authentication providers.', { google: configured }));
  router.get('/google', (req, res, next) => {
    if (!configured) { next(new AppError(503, 'Google sign-in is unavailable.', 'OAUTH_UNAVAILABLE')); return; }
    const state = randomBytes(24).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    const booking = typeof req.query.booking === 'string' && /^[a-f0-9-]{36}$/i.test(req.query.booking) ? req.query.booking : '';
    res.cookie(cookie, [state, verifier, booking].join('.'), { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: callback, response_type: 'code',
      scope: 'openid email profile', state, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    res.redirect(url.href);
  });

  router.get('/google/callback', asyncHandler(async (req, res) => {
    const value = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(cookie + '='))?.slice(cookie.length + 1);
    const [state, verifier, booking] = value?.split('.') ?? [];
    res.clearCookie(cookie, cookieOptions);
    const failure = new URL('/sign-in', env.CLIENT_URL);
    failure.searchParams.set('error', 'google');
    if (booking && /^[a-f0-9-]{36}$/i.test(booking)) failure.searchParams.set('booking', booking);
    if (!configured || !state || !verifier || req.query.state !== state || typeof req.query.code !== 'string') {
      res.redirect(failure.href);
      return;
    }
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', signal: AbortSignal.timeout(12_000), body: new URLSearchParams({
          code: req.query.code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callback, grant_type: 'authorization_code', code_verifier: verifier,
        }),
      });
      if (!response.ok) throw new Error('Token exchange failed');
      const token = z.object({ access_token: z.string().min(1) }).parse(await response.json());
      const userInfo = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(12_000),
      });
      if (!userInfo.ok) throw new Error('Google profile unavailable');
      const profile = z.object({
        sub: z.string().min(1).max(255), email: z.string().email().max(254),
        email_verified: z.literal(true), name: z.string().trim().min(1).max(120).optional(),
      }).parse(await userInfo.json());
      let user = await UserModel.findOne({ googleSubject: profile.sub });
      user ??= await getBetterAuth()?.findGoogleOwner(profile.sub) ?? null;
      if (!user) {
        if (await UserModel.exists({ email: profile.email.toLowerCase() })) throw new Error('Account linking is not enabled');
        user = await UserModel.create({ name: profile.name ?? profile.email, email: profile.email.toLowerCase(), googleSubject: profile.sub });
      }
      if (user.isBlocked) throw new Error('Account blocked');
      await issueSession(req, res, user._id, false);
      const destination = booking ? new URL('/sign-in', env.CLIENT_URL) : new URL(user.role === 'admin' ? '/admin' : '/customer', env.CLIENT_URL);
      if (booking) { destination.searchParams.set('booking', booking); destination.searchParams.set('resume', '1'); }
      res.redirect(destination.href);
    } catch {
      res.redirect(failure.href);
    }
  }));
}
