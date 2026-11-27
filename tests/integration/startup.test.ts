import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import mongoose from 'mongoose';
import { expect, it } from 'vitest';
import { createQaDatabase, qaTarget } from '../fixtures/qa-database';

const uri = process.env.SALONBOOK_PHASE03_LOCAL_TEST_URI;
const compiled = existsSync('dist/server.js');
const origin = 'https://client.example.test';

function launch(overrides: NodeJS.ProcessEnv = {}) {
  const secret = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['dist/server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'info', PORT: '5000',
      MONGODB_URI: uri ?? '', MONGODB_DB_NAME: '',
      BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: origin, CLIENT_URL: origin,
      ALLOWED_ORIGINS: origin, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
      ...overrides,
    },
  });
  let logs = '';
  child.stdout.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  const closed = once(child, 'close');
  return { child, closed, logs: () => logs };
}

function diagnostic(logs: string) {
  const line = logs.split('\n').find((entry) => entry.includes('"SalonBook API failed to start."'));
  expect(line).toBeDefined();
  return JSON.parse(line!);
}

it.runIf(compiled)('reports configuration failures from imports and auth validation', async () => {
  const configuration = launch({ LOG_LEVEL: 'invalid' });
  expect((await configuration.closed)[0]).toBe(1);
  expect(diagnostic(configuration.logs())).toMatchObject({
    step: 'environment.validate', error: { name: 'Error', message: expect.stringContaining('LOG_LEVEL') },
  });

  const auth = launch({ CLIENT_URL: 'https://wrong-client.example.test', LOG_LEVEL: 'silent' });
  expect((await auth.closed)[0]).toBe(1);
  expect(diagnostic(auth.logs())).toMatchObject({
    step: 'auth.validate', error: { name: 'Error', message: expect.stringContaining('CLIENT_URL must have the same') },
  });
  expect(auth.logs()).not.toContain('wrong-client.example.test');
});

it.runIf(compiled)('reports a driver URI parse failure without printing the supplied URI', async () => {
  const uriWithSecret = 'mongodb+srv://sample-user:fake-password@localhost:1234/db';
  const server = launch({ MONGODB_URI: uriWithSecret });
  expect((await server.closed)[0]).toBe(1);
  expect(diagnostic(server.logs())).toMatchObject({
    step: 'mongodb.connect', error: { name: 'MongoParseError', message: expect.stringContaining('port') },
  });
  expect(server.logs()).not.toMatch(/fake-password|sample-user/);
});

it.runIf(compiled && Boolean(uri))('runs the compiled production entry point and verifies readiness', async () => {
  const target = qaTarget(undefined, uri);
  const qa = createQaDatabase('salonbook_qa');
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Could not determine test port.');
  const { port } = address;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const server = launch({ MONGODB_URI: target, MONGODB_DB_NAME: qa.name, PORT: String(port) });
  try {
    await expect.poll(async () => {
      try { return (await fetch('http://127.0.0.1:' + port + '/api/ready')).status; } catch { return 0; }
    }, { timeout: 15_000, interval: 150 }).toBe(200);
    expect(server.logs()).toContain('SalonBook API listening');
  } finally {
    server.child.kill();
    await server.closed;
  }
}, 20_000);

it.runIf(compiled && Boolean(uri))('names the failing collection and hides duplicate values from index errors', async () => {
  const target = qaTarget(undefined, uri);
  const qa = createQaDatabase('salonbook_qa');
  const email = 'startup-duplicate@example.test';
  try {
    await qa.connect(target);
    await mongoose.connection.db!.collection('Users').insertMany([{ email }, { email }]);
    const server = launch({ MONGODB_URI: target, MONGODB_DB_NAME: qa.name });
    expect((await server.closed)[0]).toBe(1);
    expect(diagnostic(server.logs())).toMatchObject({
      step: 'mongodb.indexes.Users', error: { name: 'MongoServerError', code: 11000, message: expect.stringContaining('duplicate key') },
    });
    expect(server.logs()).not.toContain(email);
  } finally {
    await qa.close();
  }
}, 20_000);
