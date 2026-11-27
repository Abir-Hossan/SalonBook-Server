import { describe, expect, it } from 'vitest';
import { stripePaymentsEnabled } from '../../src/modules/payments/stripe-config';

const sandbox = {
  NODE_ENV: 'production',
  STRIPE_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
} as const;
const live = { ...sandbox, STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'rk_live_fixture' } as const;

describe('Stripe payment mode', () => {
  it('requires matching credentials for each mode', () => {
    expect(stripePaymentsEnabled(sandbox)).toBe(true);
    expect(stripePaymentsEnabled(live)).toBe(true);
    expect(stripePaymentsEnabled({ ...sandbox, STRIPE_SECRET_KEY: live.STRIPE_SECRET_KEY })).toBe(false);
    expect(stripePaymentsEnabled({ ...live, STRIPE_SECRET_KEY: sandbox.STRIPE_SECRET_KEY })).toBe(false);
    expect(stripePaymentsEnabled({ ...live, STRIPE_WEBHOOK_SECRET: undefined })).toBe(false);
  });

  it('keeps live payments off in staging and development', () => {
    expect(stripePaymentsEnabled({ ...live, SALONBOOK_DEPLOYMENT: 'staging' })).toBe(false);
    expect(stripePaymentsEnabled({ ...live, NODE_ENV: 'development' })).toBe(false);
    expect(stripePaymentsEnabled({ ...sandbox, SALONBOOK_DEPLOYMENT: 'staging' })).toBe(true);
  });
});
