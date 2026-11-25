import type { IncomingMessage, ServerResponse } from 'node:http';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env';
import { UserModel } from '../../database/models/user.model';
import { AppError } from '../../utils/errors';
import { verifyLegacyPassword } from './legacy-password';

export const betterAuthPath = '/api/better-auth';
const accountCollection = 'BetterAuthAccounts';
const sessionCollection = 'BetterAuthSessions';
const emailCredentials = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });
const redirectFields = ['callbackURL', 'errorCallbackURL', 'newUserCallbackURL'] as const;

function isTrustedRedirect(value: string, origin: string): boolean {
  try {
    if (value.includes('\\') || value.startsWith('//')) return false;
    const url = value.startsWith('/') ? new URL(value, origin) : new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      [origin, ...env.allowedOrigins].includes(url.origin);
  } catch {
    return false;
  }
}

const signUpDetails = z.object({
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/),
  acceptedTerms: z.literal(true),
});

export function validateBetterAuthConfig() {
  const secret = env.BETTER_AUTH_SECRET;
  const url = env.BETTER_AUTH_URL;
  if (!secret || !url) throw new Error('BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.');
  const address = new URL(url);
  if (!['https:', 'http:'].includes(address.protocol) || address.href !== address.origin + '/' ||
      (env.NODE_ENV === 'production' && address.protocol !== 'https:')) {
    throw new Error('BETTER_AUTH_URL must be an HTTP(S) origin and use HTTPS in production.');
  }
  if (env.NODE_ENV === 'production' && (new URL(env.CLIENT_URL).origin !== address.origin || !env.allowedOrigins.includes(address.origin))) {
    throw new Error('CLIENT_URL and ALLOWED_ORIGINS must include the public BETTER_AUTH_URL origin.');
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('Set both Google OAuth credentials or leave both unset.');
  }
  return { secret, origin: address.origin };
}

async function createBetterAuth(config: ReturnType<typeof validateBetterAuthConfig>) {
  const [{ betterAuth }, { mongodbAdapter }, { APIError, createAuthMiddleware }, node, { hashPassword }, http, { jwt }, jose] =
    await Promise.all([import('better-auth'), import('@better-auth/mongo-adapter'), import('better-auth/api'),
      import('better-auth/node'), import('better-auth/crypto'), import('better-call/node'), import('better-auth/plugins'), import('jose')]);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Connect MongoDB before initializing Better Auth.');
  const accounts = db.collection(accountCollection);
  const sessions = db.collection<{ _id: string | mongoose.Types.ObjectId; userId: string | mongoose.Types.ObjectId; expiresAt: Date }>(sessionCollection);
  // Use the existing Mongoose MongoClient and the same database as the domain repositories.
  await Promise.all([
    accounts.createIndex({ providerId: 1, accountId: 1 }, { unique: true, name: 'salonbook_auth_provider_account' }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'salonbook_auth_session_expiry' }),
  ]);

  async function bindAccount(providerId: string, accountId: string, userId: string, password?: string) {
    const now = new Date();
    const owner = new mongoose.mongo.ObjectId(userId);
    try {
      await accounts.updateOne({ providerId, accountId, userId: owner }, {
        $setOnInsert: { providerId, accountId, userId: owner, createdAt: now, updatedAt: now, ...(password && { password }) },
      }, { upsert: true });
    } catch (error) {
      if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000 ||
          !await accounts.findOne({ providerId, accountId, userId: owner })) throw error;
    }
  }

  const instance = betterAuth({
    appName: 'SalonBook',
    baseURL: config.origin,
    basePath: betterAuthPath,
    secret: config.secret,
    trustedOrigins: env.allowedOrigins,
    database: mongodbAdapter(db, { client: mongoose.connection.getClient() }),
    logger: { disabled: true },
    onAPIError: { errorURL: new URL('/sign-in', env.CLIENT_URL).href },
    user: {
      modelName: 'Users',
      additionalFields: {
        role: { type: 'string', defaultValue: 'customer', input: false, returned: false },
        isBlocked: { type: 'boolean', defaultValue: false, input: false, returned: false },
        acceptedTerms: { type: 'boolean', required: false, input: true, returned: false },
      },
    },
    account: {
      modelName: accountCollection,
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
    },
    verification: { modelName: 'BetterAuthVerifications' },
    plugins: [jwt({ disableSettingJwtHeader: true, jwt: {
      issuer: config.origin, audience: config.origin, expirationTime: '5m', definePayload: ({ session }) => ({ sid: session.id }),
    } })],
    session: { modelName: sessionCollection, expiresIn: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production' || config.origin.startsWith('https:'),
      cookiePrefix: 'salonbook',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        overrideUserInfoOnSignIn: false,
        async mapProfileToUser(profile) {
          if (profile.email_verified !== true || !profile.sub) {
            throw new APIError('FORBIDDEN', { message: 'Google email verification is required.' });
          }
          const owner = await UserModel.findOne({ googleSubject: profile.sub }).select('_id isBlocked').lean();
          if (owner) {
            if (owner.isBlocked) throw new APIError('FORBIDDEN', { message: 'This account is blocked.' });
            await bindAccount('google', profile.sub, String(owner._id));
          }
          return {};
        },
      },
    } : {},
    databaseHooks: {
      session: {
        create: {
          async before(session, context) {
            const owner = await UserModel.findById(session.userId).select('isBlocked').lean();
            // New users created inside Better Auth's transaction may not be visible to Mongoose yet.
            if (owner?.isBlocked) throw new APIError('FORBIDDEN', { code: 'ACCOUNT_BLOCKED', message: 'This account is blocked.' });
            if (context?.path !== '/sign-in/email' || context.body?.rememberMe === false) {
              return { data: { ...session, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) } };
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        for (const field of redirectFields) {
          const value = ctx.body?.[field];
          if (typeof value === 'string' && !isTrustedRedirect(value, config.origin)) {
            throw new APIError('FORBIDDEN', { code: 'INVALID_AUTH_REDIRECT', message: 'The callback URL is not trusted.' });
          }
        }
        if (ctx.path === '/sign-in/social' && ctx.body?.idToken) {
          throw new APIError('BAD_REQUEST', { message: 'Use the Google redirect flow.' });
        }
        if (ctx.path === '/sign-up/email') {
          const details = signUpDetails.safeParse(ctx.body);
          if (!details.success || !emailCredentials.safeParse(ctx.body).success) {
            throw new APIError('BAD_REQUEST', { message: 'Enter valid registration details and accept the SalonBook terms.' });
          }
          return { context: { body: { ...ctx.body, name: details.data.name } } };
        }
        if (ctx.path !== '/sign-in/email') return;
        const input = emailCredentials.safeParse(ctx.body);
        if (!input.success) throw new APIError('BAD_REQUEST', { message: 'Enter valid sign-in details.' });
        const email = input.data.email.toLowerCase();
        const owner = await UserModel.findOne({ email }).select('+passwordHash').lean();
        if (owner?.passwordHash) {
          const id = String(owner._id);
          const existing = await accounts.findOne({ providerId: 'credential', accountId: id });
          if (!existing && await verifyLegacyPassword(input.data.password, owner.passwordHash)) {
            if (owner.isBlocked) throw new APIError('FORBIDDEN', { code: 'ACCOUNT_BLOCKED', message: 'This account is blocked.' });
            await bindAccount('credential', id, id, await hashPassword(input.data.password));
          }
        }
        return { context: { body: { ...ctx.body, email } } };
      }),
    },
  });
  return {
    api: instance.api,
    async handler(req: IncomingMessage, res: ServerResponse) {
      const bodySizeLimit = 32 * 1024;
      if (Number(req.headers['content-length']) > bodySizeLimit) {
        throw new AppError(413, 'Request body is too large.', 'PAYLOAD_TOO_LARGE');
      }
      const request = http.getRequest({ request: req, base: config.origin, bodySizeLimit });
      await http.setResponse(res, await instance.handler(request));
    },
    headers: node.fromNodeHeaders,
    async verifyAccessToken(token: string) {
      if (token.length > 2048) return null;
      const jwks = await instance.api.getJwks();
      let payload;
      try {
        ({ payload } = await jose.jwtVerify(token, jose.createLocalJWKSet(jwks), {
          issuer: config.origin, audience: config.origin, requiredClaims: ['exp', 'sub', 'sid'],
        }));
      } catch { return null; }
      if (!payload.sub || typeof payload.sid !== 'string' || payload.sid.length > 128) return null;
      const sid = payload.sid;
      const session = await sessions.findOne({
        _id: { $in: /^[a-f0-9]{24}$/i.test(sid) ? [sid, new mongoose.mongo.ObjectId(sid)] : [sid] },
        expiresAt: { $gt: new Date() },
      });
      return session && String(session.userId) === payload.sub ? payload.sub : null;
    },
    async findGoogleOwner(subject: string) {
      const account = await accounts.findOne<{ userId: mongoose.Types.ObjectId }>({ providerId: 'google', accountId: subject });
      return account ? UserModel.findById(account.userId) : null;
    },
  };
}

let auth: Awaited<ReturnType<typeof createBetterAuth>> | undefined;

export async function initializeBetterAuth(config: ReturnType<typeof validateBetterAuthConfig>) {
  auth = await createBetterAuth(config);
}

export function getBetterAuth() {
  return auth;
}
