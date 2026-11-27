import { expect, it } from 'vitest';
import { startupFailure, startupStep } from '../../src/utils/startup-error';

it('reports the originating step and nested driver errors with credential-safe stack frames', async () => {
  const uri = 'mongodb+srv://db-user:secret%3Apass@db.example.test/database';
  const token = 'test-api-token-to-redact';
  const tls = Object.assign(new Error('certificate verify failed with secret:pass and db-user'), {
    code: 'ERR_TLS_CERT_ALTNAME_INVALID',
  });
  tls.stack = 'Error: raw credentials ' + uri + '\n    at connect (/home/private/connection.js:34:11)';
  const error = Object.assign(new Error('cannot connect to ' + uri + ' using ' + token), {
    name: 'MongooseServerSelectionError',
    reason: { servers: new Map([['private-host', { error: tls }]]) },
  });
  await expect(startupStep('startup', () => startupStep('mongodb.connect', () => { throw error; }))).rejects.toSatisfy(failure => {
    const report = startupFailure('startup', failure, { MONGODB_URI: uri, STRIPE_SECRET_KEY: token });
    expect(report.step).toBe('mongodb.connect');
    expect(report.error).toMatchObject({ name: 'MongooseServerSelectionError', message: expect.stringContaining('cannot connect') });
    expect(report.causes).toContainEqual(expect.objectContaining({
      code: 'ERR_TLS_CERT_ALTNAME_INVALID', stack: ['connection.js:34:11'], message: expect.stringContaining('certificate verify failed'),
    }));
    expect(JSON.stringify(report)).not.toMatch(/db-user|secret:pass|secret%3Apass|mongodb\+srv|test-api-token|private-host|home\/private/);
    return true;
  });
});

it('retains numeric MongoDB codes without logging index values, commands or header values', () => {
  const duplicate = Object.assign(new Error('E11000 duplicate key index: users_email_unique dup key: { email: "customer@example.test" }'), { code: 11000 });
  const report = startupFailure('indexes', duplicate, {});
  expect(report.error).toMatchObject({ message: 'E11000 duplicate key index: users_email_unique dup key: [REDACTED]', code: 11000 });
  const unauthorized = startupFailure('indexes', new Error('not authorized to execute command { credential: "hidden" }'), {});
  expect(unauthorized.error.message).toBe('not authorized to execute command [REDACTED]');
  const header = startupFailure('auth', new Error('Cookie: name=hidden; second=hidden'), {});
  expect(header.error.message).toBe('Cookie: [REDACTED]');
});
