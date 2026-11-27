type StagingConfig = {
  NODE_ENV: string;
  MONGODB_URI?: string;
  MONGODB_DB_NAME?: string;
  SALONBOOK_STAGING_MONGODB_HOST?: string;
  CLIENT_URL: string;
  BETTER_AUTH_URL?: string;
  NODE_TLS_REJECT_UNAUTHORIZED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  IMGBB_API_KEY?: string;
};

const database = 'salonbook_staging';
const atlasHost = /^[a-z0-9-]+\.[a-z0-9-]+\.mongodb\.net$/;
const safeOptions = new Map([
  ['authSource', /^admin$/], ['retryWrites', /^true$/], ['w', /^majority$/],
  ['appName', /^[A-Za-z0-9_. -]{1,128}$/], ['tls', /^true$/],
]);

export function validateStagingConfig(config: StagingConfig, origins: string[]) {
  if (config.NODE_ENV !== 'production' || origins.length !== 1 || !origins[0]?.startsWith('https://') ||
      config.CLIENT_URL !== origins[0] || config.BETTER_AUTH_URL !== origins[0]) {
    throw new Error('Staging requires one exact HTTPS Client origin for CORS, CLIENT_URL and BETTER_AUTH_URL.');
  }
  if (config.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Staging requires TLS certificate verification.');
  }
  if ([config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.IMGBB_API_KEY].some(Boolean)) {
    throw new Error('Staging requires Google and ImgBB credentials to be unset.');
  }
  const { STRIPE_SECRET_KEY: stripeKey, STRIPE_WEBHOOK_SECRET: webhookSecret } = config;
  if ((stripeKey || webhookSecret) &&
      (!/^(?:sk|rk)_test_\S+$/.test(stripeKey ?? '') || !/^whsec_\S+$/.test(webhookSecret ?? ''))) {
    throw new Error('Staging Stripe Checkout requires a test API key and webhook signing secret together.');
  }
  const host = config.SALONBOOK_STAGING_MONGODB_HOST;
  if (config.MONGODB_DB_NAME !== database || !host || !atlasHost.test(host)) {
    throw new Error('Staging requires the salonbook_staging database and an explicitly configured staging Atlas hostname.');
  }
  let uri: URL;
  try { uri = new URL(config.MONGODB_URI ?? ''); }
  catch { throw new Error('Staging requires an Atlas SRV connection string.'); }
  if (uri.protocol !== 'mongodb+srv:' || uri.host !== host || !['', '/', '/' + database].includes(uri.pathname) ||
      !uri.username || !uri.password || uri.hash) {
    throw new Error('Staging MongoDB URI must match the configured Atlas host and staging database.');
  }
  for (const [key, value] of uri.searchParams) {
    if (!safeOptions.get(key)?.test(value) || uri.searchParams.getAll(key).length !== 1) {
      throw new Error('Staging MongoDB URI contains an unsupported or insecure connection option.');
    }
  }
}
