type StripeEnvironment = {
  NODE_ENV: 'development' | 'test' | 'production';
  SALONBOOK_DEPLOYMENT?: string;
  STRIPE_MODE: 'test' | 'live';
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export function stripePaymentsEnabled(config: StripeEnvironment) {
  const live = config.STRIPE_MODE === 'live';
  if (live && (config.NODE_ENV !== 'production' || config.SALONBOOK_DEPLOYMENT === 'staging')) return false;
  const keyPattern = live ? /^(?:sk|rk)_live_\S+$/ : /^(?:sk|rk)_test_\S+$/;
  return keyPattern.test(config.STRIPE_SECRET_KEY ?? '') && /^whsec_\S+$/.test(config.STRIPE_WEBHOOK_SECRET ?? '');
}
