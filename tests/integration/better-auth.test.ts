import { createHmac, generateKeyPairSync, randomBytes, scryptSync, sign } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { AppointmentModel } from '../../src/database/models/appointment.model';
import { ServiceModel } from '../../src/database/models/service.model';
import { TransactionModel } from '../../src/database/models/transaction.model';
import { UserModel } from '../../src/database/models/user.model';
import { createMongoRepositories } from '../../src/database/repositories/mongo.repositories';
import { initializeBetterAuth } from '../../src/modules/auth/better-auth';
import { appointmentSeed, ids, serviceSeed, transactionSeed } from '../fixtures/data';
import { createQaDatabase, qaTarget } from '../fixtures/qa-database';

vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'salonbook-oauth-test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'salonbook-oauth-test-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
  process.env.IMGBB_API_KEY = 'imgbb_mock';
});

const localUri = process.env.SALONBOOK_AUTH_TEST_URI;
const atlasUri = process.env.SALONBOOK_AUTH_ATLAS_TEST_URI;
const qa = createQaDatabase('salonbook_auth_qa');
const origin = env.allowedOrigins[0] ?? env.CLIENT_URL;
const password = 'DemoPassword12';
const patron = (key: string) => ({ name: 'Test Patron', email: key + '@example.test', password, acceptedTerms: true });
const salt = '0123456789abcdef0123456789abcdef';
const legacyHash = salt + ':' + scryptSync(password, salt, 64).toString('hex');

describe.skipIf(!localUri && !atlasUri)('Better Auth with disposable MongoDB (' + (atlasUri ? 'Atlas' : 'loopback') + ')', () => {
  const app = () => createApp({ repositories: createMongoRepositories(), enableMongoAuth: true });
  const signUp = (agent: ReturnType<typeof request.agent>, key: string) =>
    agent.post('/api/auth/register').set('Origin', origin).send(patron(key));
  const signIn = (agent: ReturnType<typeof request.agent>, key: string, input = password) =>
    agent.post('/api/auth/sign-in').set('Origin', origin).send({ email: patron(key).email, password: input });

  beforeAll(async () => {
    await qa.connect(qaTarget(atlasUri, localUri));
    await Promise.all([UserModel.createIndexes(), ServiceModel.createIndexes(),
      AppointmentModel.createIndexes(), TransactionModel.createIndexes()]);
    await initializeBetterAuth({ origin: 'http://localhost:5000', secret: randomBytes(48).toString('hex') });
    await ServiceModel.create({ ...serviceSeed[0], _id: ids.service });
    await UserModel.create([
      { ...patron('legacy'), _id: ids.user, passwordHash: legacyHash },
      { ...patron('admin'), _id: ids.admin, role: 'admin', passwordHash: legacyHash },
    ]);
    await AppointmentModel.create({ ...appointmentSeed[0], _id: ids.appointment,
      activeSlotKey: appointmentSeed[0]!.appointmentDate + '|' + appointmentSeed[0]!.timeSlot });
    await TransactionModel.create({ ...transactionSeed[0], _id: ids.transaction });
  }, 30000);

  afterAll(() => qa.close(), 15000);

  it('registers a real customer and rejects duplicate email and forged role', async () => {
    const agent = request.agent(app());
    const created = await signUp(agent, 'new').expect(201);
    expect(created.body.data).toMatchObject({ role: 'customer', id: expect.stringMatching(/^[a-f0-9]{24}$/) });
    const row = await UserModel.findById(created.body.data.id).select('+passwordHash').lean();
    expect(row).toMatchObject({ email: patron('new').email, role: 'customer', isBlocked: false });
    expect(row?.passwordHash).toBeUndefined();
    expect((await agent.get('/api/auth/me').expect(200)).body.data.id).toBe(created.body.data.id);
    const duplicate = await signUp(agent, 'new').expect(409);
    expect(duplicate.body.errors[0].code).toBe('EMAIL_CONFLICT');
    await agent.post('/api/auth/register').set('Origin', origin).send({ ...patron('forged'), role: 'admin' }).expect(400);
  });

  it('logs in, rejects bad credentials and revokes the cookie on logout', async () => {
    const agent = request.agent(app());
    await signUp(agent, 'logout').expect(201);
    await signIn(agent, 'logout', 'WrongPassword1').expect(401);
    const signedIn = await signIn(agent, 'logout').expect(200);
    const cookies = signedIn.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('salonbook.session_token='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    await agent.post('/api/auth/sign-out').set('Origin', origin).expect(204);
    await request(app()).get('/api/auth/me').set('Cookie', cookie.split(';')[0]!).expect(401);
  });

  it('serves the native Better Auth path and rejects untrusted writes', async () => {
    const agent = request.agent(app());
    await agent.post('/api/better-auth/sign-up/email').send(patron('native')).expect(403);
    const result = await agent.post('/api/better-auth/sign-up/email').set('Origin', origin)
      .send({ ...patron('native'), rememberMe: false }).expect(200);
    expect(result.body.user.email).toBe(patron('native').email);
    expect(result.body.user).not.toHaveProperty('passwordHash');
    expect(result.body.user).not.toHaveProperty('role');
    await agent.get('/api/better-auth/get-session').expect(200);
    await agent.post('/api/better-auth/sign-up/email').set('Origin', origin)
      .send({ ...patron('oversized'), name: 'x'.repeat(34_000) }).expect(413);
    await agent.post('/api/better-auth/update-user').set('Origin', origin).send({ role: 'admin' }).expect(404);
  });

  it('rejects expired sessions', async () => {
    const agent = request.agent(app());
    const created = await signUp(agent, 'expired').expect(201);
    await mongoose.connection.db!.collection('BetterAuthSessions').updateMany(
      { userId: new mongoose.Types.ObjectId(created.body.data.id) }, { $set: { expiresAt: new Date(0) } },
    );
    await agent.get('/api/auth/me').expect(401);
  });

  it('issues a signed access token bound to its session', async () => {
    const agent = request.agent(app());
    const user = await signUp(agent, 'jwt').expect(201);
    const issued = await agent.get('/api/better-auth/token').expect(200);
    const token = issued.body.token;
    expect(typeof token).toBe('string');
    const bearer = () => request(app()).get('/api/auth/me').set('Authorization', 'Bearer ' + token);
    expect((await bearer().expect(200)).body.data.id).toBe(user.body.data.id);
    await request(app()).get('/api/auth/me').set('Authorization', 'Bearer broken.jwt.value').expect(401);
    await agent.post('/api/auth/sign-out').set('Origin', origin).expect(204);
    await bearer().expect(401);
  });

  it('renews remembered sessions and preserves the short-session expiry', async () => {
    const agent = request.agent(app());
    const created = await signUp(agent, 'remember').expect(201);
    const sessions = mongoose.connection.db!.collection('BetterAuthSessions');
    const owner = { userId: new mongoose.Types.ObjectId(created.body.data.id) };
    const short = await sessions.findOne(owner);
    await agent.get('/api/better-auth/get-session').expect(200);
    expect((await sessions.findOne(owner))?.expiresAt).toEqual(short?.expiresAt);
    await agent.post('/api/auth/sign-in').set('Origin', origin).send({ email: patron('remember').email, password, remember: true }).expect(200);
    const day = 86400000;
    const remembered = await sessions.findOne({ ...owner, expiresAt: { $gt: new Date(Date.now() + 2 * day) } });
    expect(remembered).not.toBeNull();
    await sessions.updateOne({ _id: remembered!._id }, {
      $set: { expiresAt: new Date(Date.now() + 8 * day), createdAt: new Date(Date.now() - 22 * day) },
    });
    await agent.get('/api/better-auth/get-session').expect(200);
    expect((await sessions.findOne({ _id: remembered!._id }))!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 20 * day);
  });

  it('authorizes, validates and saves an uploaded service image using a controlled provider response', async () => {
    const admin = request.agent(app());
    await signIn(admin, 'admin').expect(200);
    const customer = request.agent(app());
    await signUp(customer, 'image-customer').expect(201);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const upload = (agent: typeof admin, body: Buffer) => agent.post('/api/admin/images/service').set('Origin', origin).set('Content-Type', 'image/png').send(body);
    await upload(customer, png).expect(403);
    await upload(admin, Buffer.from('invalid')).expect(415);
    const img = 'https://i.ibb.co/example/salon.png';
    vi.stubGlobal('fetch', vi.fn(async (target: URL) => {
      expect(target.host).toBe('api.imgbb.com');
      return Response.json({ success: true, data: { url: img } });
    }));
    try {
      const response = await upload(admin, png).expect(201);
      expect(response.body.data.image).toBe(img);
      const saved = await admin.post('/api/services').set('Origin', origin).send({
        serviceName: 'Service image acceptance', category: 'Beauty', description: 'Service with a verified image upload.',
        price: 30, duration: 60, image: img,
      }).expect(201);
      expect((await ServiceModel.findById(saved.body.data.id))?.image).toBe(img);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('validates Stripe test webhooks and records a paid appointment only once', async () => {
    const agent = request.agent(app());
    const user = await signUp(agent, 'stripe').expect(201);
    const attempt = '610d182e-aeee-4f23-a3ef-6202b3dc79ca';
    const booking = await AppointmentModel.create({
      serviceId: ids.service, customerId: user.body.data.id, appointmentDate: '2099-08-08',
      timeSlot: '04:00 PM', servicePrice: 165, status: 'confirmed', paymentStatus: 'unpaid', checkoutAttempt: attempt,
    });
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: {
      id: 'cs_test_salonbook', status: 'complete', payment_status: 'paid', amount_total: 16500,
      currency: 'usd', livemode: false, metadata: { appointmentId: String(booking._id), attempt },
    } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET!).update(timestamp + '.' + body).digest('hex');
    const webhook = (signature: string) => request(app()).post('/api/payments/webhook')
      .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(body);
    await webhook('bad').expect(400);
    expect((await AppointmentModel.findById(booking._id))?.paymentStatus).toBe('unpaid');
    await webhook(`t=${timestamp},v1=${signed}`).expect(204);
    await webhook(`t=${timestamp},v1=${signed}`).expect(204);
    expect((await AppointmentModel.findById(booking._id))?.paymentStatus).toBe('paid');
    expect(await TransactionModel.countDocuments({ appointmentId: booking._id })).toBe(1);
  });

  it('lets an admin release a recorded test checkout after Stripe confirms expiry', async () => {
    const admin = request.agent(app());
    await signIn(admin, 'admin').expect(200);
    const customer = request.agent(app());
    const user = await signUp(customer, 'checkout-release').expect(201);
    const attempt = '540be2c0-9832-426a-86d7-619cdde7a03d';
    const sessionId = 'cs_test_checkout_release';
    const booking = await AppointmentModel.create({
      serviceId: ids.service, customerId: user.body.data.id, appointmentDate: '2099-08-09',
      timeSlot: '01:00 PM', servicePrice: 165, status: 'confirmed', paymentStatus: 'unpaid',
      checkoutAttempt: attempt, checkoutSessionId: sessionId,
    });
    const data = { appointmentId: String(booking._id) };
    const release = (agent: typeof admin) => agent.post('/api/payments/release-checkout').set('Origin', origin).send(data);
    await release(customer).expect(403);
    await admin.patch('/api/admin/appointments/' + data.appointmentId + '/cancel').set('Origin', origin).expect(409);
    vi.stubGlobal('fetch', vi.fn(async (target: string, options?: RequestInit) => {
      const expiry = target.endsWith('/expire');
      expect(target).toBe('https://api.stripe.com/v1/checkout/sessions/' + sessionId + (expiry ? '/expire' : ''));
      expect(options?.method).toBe(expiry ? 'POST' : undefined);
      return Response.json({
        id: sessionId, status: expiry ? 'expired' : 'open', payment_status: 'unpaid',
        amount_total: 16500, currency: 'usd', livemode: false, metadata: { ...data, attempt },
      });
    }));
    try {
      await release(admin).expect(200);
      const updated = await AppointmentModel.findById(booking._id);
      expect(updated?.checkoutAttempt).toBeUndefined();
      expect(updated?.paymentStatus).toBe('unpaid');
      await admin.patch('/api/admin/appointments/' + data.appointmentId + '/cancel').set('Origin', origin).expect(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a blocked account at login and after an administrator blocks its live session', async () => {
    const agent = request.agent(app());
    const created = await signUp(agent, 'blocked').expect(201);
    const admin = request.agent(app());
    await signIn(admin, 'admin').expect(200);
    await admin.patch('/api/admin/users/' + created.body.data.id + '/block').set('Origin', origin).expect(200);
    await agent.get('/api/auth/me').expect(403);
    await agent.get('/api/better-auth/get-session').expect(403);
    await signIn(request.agent(app()), 'blocked').expect(403);
  });

  it('preserves legacy IDs and hashes and enforces appointment and transaction ownership', async () => {
    const legacy = request.agent(app());
    await signIn(legacy, 'legacy', 'WrongPassword1').expect(401);
    const migrated = await signIn(legacy, 'legacy').expect(200);
    expect(migrated.body.data.id).toBe(ids.user);
    expect((await UserModel.findById(ids.user).select('+passwordHash').lean())?.passwordHash).toBe(legacyHash);
    const session = await legacy.get('/api/better-auth/get-session').expect(200);
    expect(session.body.user).not.toHaveProperty('passwordHash');
    expect((await legacy.get('/api/appointments/' + ids.appointment).expect(200)).body.data.customerId).toBe(ids.user);
    expect((await legacy.get('/api/transactions/' + ids.transaction).expect(200)).body.data.customerId).toBe(ids.user);

    const other = request.agent(app());
    await signUp(other, 'other').expect(201);
    await other.get('/api/appointments/' + ids.appointment).expect(404);
    await other.get('/api/transactions/' + ids.transaction).expect(404);
    await other.get('/api/admin/users').expect(403);
    const admin = request.agent(app());
    await signIn(admin, 'admin').expect(200);
    await admin.get('/api/admin/users').expect(200);
    await admin.get('/api/admin/transactions').expect(200);
  });

  it('uses Google code exchange and the verified provider subject for account ownership', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const oldGoogle = await UserModel.create({
      name: 'Legacy Google Patron', email: 'old-google@example.test', googleSubject: 'legacy-google-subject',
    });
    let profile = { sub: 'legacy-google-subject', email: oldGoogle.email, verified: true };
    const tokenExchange = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://oauth2.googleapis.com/token');
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const claims = Buffer.from(JSON.stringify({
        iss: 'https://accounts.google.com', aud: 'salonbook-oauth-test-client',
        exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000),
        sub: profile.sub, email: profile.email, email_verified: profile.verified, name: 'Google Test Patron',
      })).toString('base64url');
      const signed = header + '.' + claims;
      const idToken = signed + '.' + sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url');
      return Response.json({ access_token: 'mock-google-access-token', token_type: 'Bearer', id_token: idToken });
    });
    vi.stubGlobal('fetch', tokenExchange);
    try {
      const loginWithGoogle = async (agent: ReturnType<typeof request.agent>) => {
        const callbackURL = new URL('/customer', origin).href;
        const start = await agent.post('/api/better-auth/sign-in/social').set('Origin', origin)
          .send({ provider: 'google', callbackURL, disableRedirect: true }).expect(200);
        const authorization = new URL(start.body.url);
        expect(authorization.origin).toBe('https://accounts.google.com');
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
        expect(authorization.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/better-auth/callback/google');
        return agent.get('/api/better-auth/callback/google')
          .query({ state: authorization.searchParams.get('state'), code: 'mock-google-authorization-code' }).expect(302);
      };

      const legacyAgent = request.agent(app());
      expect((await loginWithGoogle(legacyAgent)).headers.location).toBe(new URL('/customer', origin).href);
      expect((await legacyAgent.get('/api/auth/me').expect(200)).body.data.id).toBe(String(oldGoogle._id));

      profile = { sub: 'new-google-subject', email: 'new-google@example.test', verified: true };
      const newAgent = request.agent(app());
      expect((await loginWithGoogle(newAgent)).headers.location).toBe(new URL('/customer', origin).href);
      const newUser = await newAgent.get('/api/auth/me').expect(200);
      expect(newUser.body.data).toMatchObject({ email: profile.email, role: 'customer' });
      expect(await UserModel.countDocuments({ email: profile.email })).toBe(1);

      profile = { sub: 'unrelated-subject', email: 'legacy@example.test', verified: true };
      const conflictAgent = request.agent(app());
      await loginWithGoogle(conflictAgent);
      await conflictAgent.get('/api/auth/me').expect(401);
      expect(await UserModel.countDocuments({ email: profile.email })).toBe(1);
      expect(tokenExchange).toHaveBeenCalledTimes(3);

      await conflictAgent.post('/api/better-auth/sign-in/social').set('Origin', origin)
        .send({ provider: 'google', callbackURL: 'https://untrusted.example.test/' }).expect(403);
      expect(tokenExchange).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates and cancels a MongoDB appointment using a customer session', async () => {
    const agent = request.agent(app());
    const created = await signUp(agent, 'booking').expect(201);
    const appointmentDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const booked = await agent.post('/api/appointments').set('Origin', origin)
      .send({ serviceId: ids.service, appointmentDate, timeSlot: '09:30 AM' }).expect(201);
    const id = booked.body.data.id;
    expect(String((await AppointmentModel.findById(id).lean())?.customerId)).toBe(created.body.data.id);
    await agent.patch('/api/appointments/' + id + '/cancel').set('Origin', origin).expect(200);
    expect((await AppointmentModel.findById(id).lean())?.status).toBe('cancelled');
  });

  it('sets Secure and HttpOnly cookies when Better Auth uses an HTTPS origin', async () => {
    await initializeBetterAuth({ origin: 'https://client.example.test', secret: randomBytes(48).toString('hex') });
    const response = await signUp(request.agent(app()), 'https-cookie').expect(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((value) => value.startsWith('__Secure-salonbook.session_token='));
    expect(Boolean(sessionCookie && /;\s*Secure(?:;|$)/i.test(sessionCookie))).toBe(true);
    expect(Boolean(sessionCookie && /;\s*HttpOnly(?:;|$)/i.test(sessionCookie))).toBe(true);
    expect(Boolean(sessionCookie && /;\s*SameSite=Lax(?:;|$)/i.test(sessionCookie))).toBe(true);
  });
});
