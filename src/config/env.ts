import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  SEED_DEMO_CATALOG: z.enum(['true', 'false']).default('false'),
  MONGODB_URI: z.string().trim().optional(),
  MONGODB_DB_NAME: z.string().trim().optional(),
  BETTER_AUTH_SECRET: z.string().trim().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  IMGBB_API_KEY: z.string().optional(),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REQUEST_BODY_LIMIT: z.string().default('100kb'),
  SALON_TIME_ZONE: z.string().default('UTC').refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
  }, 'Use a valid IANA time zone'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = Object.freeze({
  ...parsed.data,
  allowedOrigins: [...new Set(parsed.data.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean))]
});
