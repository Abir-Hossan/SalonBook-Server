import { afterEach, describe, expect, it, vi } from 'vitest';
import { qaTarget } from '../fixtures/qa-database';

const qaHost = 'salonbook-qa.example.mongodb.net';
const qaUri = 'mongodb+srv://fixture:fixture@' + qaHost + '/';
const local = 'mongodb://127.0.0.1:27849/?replicaSet=qa';

function configure() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SALONBOOK_ATLAS_QA_MODE', 'confirmed-disposable');
  vi.stubEnv('SALONBOOK_ATLAS_QA_HOST', qaHost);
  vi.stubEnv('MONGODB_URI', undefined);
}

afterEach(() => vi.unstubAllEnvs());

describe('QA target validation without network access', () => {
  it('requires test mode, explicit Atlas confirmation and a matching host', () => {
    configure();
    expect(qaTarget(qaUri)).toBe(qaUri);
    expect(qaTarget(undefined, local)).toBe(local);
    vi.stubEnv('SALONBOOK_ATLAS_QA_MODE', undefined);
    expect(() => qaTarget(qaUri)).toThrow(/explicit/);
    vi.stubEnv('SALONBOOK_ATLAS_QA_MODE', 'confirmed-disposable');
    vi.stubEnv('SALONBOOK_ATLAS_QA_HOST', 'other.example.mongodb.net');
    expect(() => qaTarget(qaUri)).toThrow(/safety checks/);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => qaTarget(undefined, local)).toThrow(/NODE_ENV/);
  });

  it('rejects multiple targets, known application endpoints, prod names and unsafe TLS settings', () => {
    configure();
    expect(() => qaTarget(qaUri, local)).toThrow(/exactly one/);
    vi.stubEnv('MONGODB_URI', 'mongodb+srv://different:fixture@' + qaHost + '/app');
    expect(() => qaTarget(qaUri)).toThrow(/safety checks/);
    vi.stubEnv('MONGODB_URI', undefined);
    expect(() => qaTarget(qaUri + 'production')).toThrow(/safety checks/);
    expect(() => qaTarget(qaUri + '?tls=false')).toThrow(/safety checks/);
    expect(() => qaTarget(qaUri + '?tlsAllowInvalidCertificates=true')).toThrow(/safety checks/);
  });
});
