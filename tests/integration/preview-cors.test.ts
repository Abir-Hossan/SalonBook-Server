import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';

const { production, preview, other } = vi.hoisted(() => ({
  production: 'https://salonbook-client-ivory.vercel.app',
  preview: 'https://salonbook-client-git-completion-assignment-r-82c2f1-abir-hossan.vercel.app',
  other: 'https://salonbook-unreviewed.vercel.app',
}));

vi.mock(import('../../src/config/env'), async (original) => {
  const config = await original();
  const { parseAllowedOrigins } = await import('../../src/config/allowed-origins');
  return { env: { ...config.env, allowedOrigins: parseAllowedOrigins(production + ', ' + preview, true) } };
});

const app = createApp({ enableMongoAuth: true });
const preflight = (origin: string) => request(app).options('/api/better-auth/sign-in/email')
  .set('Origin', origin)
  .set('Access-Control-Request-Method', 'POST')
  .set('Access-Control-Request-Headers', 'content-type');

it.each([production, preview])('allows only the configured origin on credentialed preflight (%s)', async (origin) => {
  await preflight(origin).expect(204)
    .expect('Access-Control-Allow-Origin', origin)
    .expect('Access-Control-Allow-Credentials', 'true')
    .expect('Vary', /Origin/i);
});

it('refuses a different Vercel origin without returning a CORS grant', async () => {
  const response = await preflight(other).expect(403);
  expect(response.body.errors[0].code).toBe('CORS_ORIGIN_DENIED');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});

it('lets the Preview reach the authentication boundary while still requiring a session', async () => {
  const response = await request(app).get('/api/auth/me').set('Origin', preview)
    .expect(401).expect('Access-Control-Allow-Origin', preview);
  expect(response.body.errors[0].code).toBe('UNAUTHENTICATED');
  await request(app).post('/api/auth/register').set('Origin', preview).send({})
    .expect(400).expect('Access-Control-Allow-Origin', preview);
});
