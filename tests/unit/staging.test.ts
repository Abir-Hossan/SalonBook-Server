import { describe, expect, it } from 'vitest';
import { validateStagingConfig } from '../../src/config/staging';

const origin = 'https://salonbook-preview.vercel.app';
const host = 'stage.example.mongodb.net';
const config = {
  NODE_ENV: 'production',
  MONGODB_DB_NAME: 'salonbook_staging',
  SALONBOOK_STAGING_MONGODB_HOST: host,
  MONGODB_URI: `mongodb+srv://fixture:fixture@${host}/?retryWrites=true&w=majority`,
  CLIENT_URL: origin,
  BETTER_AUTH_URL: origin,
};

describe('isolated staging configuration', () => {
  it('accepts the selected Atlas host and exact Preview origin', () => {
    expect(() => validateStagingConfig(config, [origin])).not.toThrow();
  });

  it('accepts a Google OAuth client and secret together', () => {
    expect(() => validateStagingConfig({
      ...config, GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret',
    }, [origin])).not.toThrow();
  });

  it.each(['sk_test_fixture', 'rk_test_fixture'])('accepts a Stripe sandbox key and signing secret (%s)', (key) => {
    expect(() => validateStagingConfig({
      ...config, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
    }, [origin])).not.toThrow();
  });

  it.each([
    { NODE_ENV: 'development' },
    { MONGODB_DB_NAME: 'salonbook' },
    { SALONBOOK_STAGING_MONGODB_HOST: undefined },
    { MONGODB_URI: config.MONGODB_URI.replace(host, 'production.example.mongodb.net') },
    { MONGODB_URI: config.MONGODB_URI.replace('/?', '/salonbook?') },
    { MONGODB_URI: config.MONGODB_URI + '&tls=false' },
    { MONGODB_URI: config.MONGODB_URI + '&tlsAllowInvalidCertificates=true' },
    { MONGODB_URI: config.MONGODB_URI + '&retryWrites=true' },
    { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com' },
    { GOOGLE_CLIENT_SECRET: 'fixture-secret' },
    { STRIPE_SECRET_KEY: 'fixture-secret' },
    { STRIPE_SECRET_KEY: 'sk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' },
    { STRIPE_SECRET_KEY: 'rk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' },
    { STRIPE_SECRET_KEY: 'sk_test_fixture' },
    { STRIPE_WEBHOOK_SECRET: 'whsec_fixture' },
    { STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'invalid_fixture' },
    { IMGBB_API_KEY: 'fixture-secret' },
    { BETTER_AUTH_URL: 'https://production.example.test' },
  ])('rejects unsafe or mismatched staging settings (%j)', (override) => {
    expect(() => validateStagingConfig({ ...config, ...override }, [origin])).toThrow(/Staging/);
  });

  it('refuses a second origin and omits credentials from errors', () => {
    expect(() => validateStagingConfig(config, [origin, 'https://production.example.test'])).toThrow(/one exact HTTPS/);
    expect(() => validateStagingConfig({ ...config, MONGODB_URI: 'not-a-uri-with-private-data' }, [origin]))
      .toThrow(/^Staging requires an Atlas SRV connection string\.$/);
  });
});
