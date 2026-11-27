export function parseAllowedOrigins(configured: string, production: boolean): string[] {
  const origins = configured.split(',').map((value) => value.trim()).filter(Boolean);
  const error = 'ALLOWED_ORIGINS must list exact HTTP(S) origins without wildcards, credentials, or paths. Production requires HTTPS.';
  if (origins.length === 0) throw new Error(error);

  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); }
    catch { throw new Error(error); }
    if (url.origin !== origin || origin.includes('*') ||
        (url.protocol !== 'https:' && (production || url.protocol !== 'http:'))) {
      throw new Error(error);
    }
  }
  return [...new Set(origins)];
}
