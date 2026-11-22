import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

const app = createApp({ enableMongoAuth: true });
const origin = env.allowedOrigins[0] ?? env.CLIENT_URL;

describe('SalonBook authentication boundaries', () => {
  it('requires a session for account and appointment APIs', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/appointments/my').set('x-user-id', '000000000000000000000001').expect(401);
  });

  it('rejects a malformed session cookie without accessing MongoDB', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'salonbook_session=invalid').expect(401);
  });

  it('requires an allowed origin before processing sign-in', async () => {
    const result = await request(app).post('/api/auth/sign-in').send({ email: 'test@example.com', password: 'Password123' }).expect(403);
    expect(result.body.errors[0].code).toBe('ORIGIN_REQUIRED');
  });

  it('rejects role assignment in public registration', async () => {
    await request(app).post('/api/auth/register').set('Origin', origin).send({
      name: 'Test Patron', email: 'patron@example.com', password: 'Password123', acceptedTerms: true, role: 'admin',
    }).expect(400);
  });

  it('requires an authenticated customer for checkout', async () => {
    await request(app).post('/api/payments/checkout').send({ appointmentId: '000000000000000000000001' }).expect(401);
  });
});
