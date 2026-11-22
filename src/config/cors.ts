import cors from 'cors';
import { env } from './env';
import { AppError } from '../utils/errors';
export const corsMiddleware = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin)) { callback(null, true); return; }
    callback(new AppError(403, 'Origin is not allowed by CORS policy.', 'CORS_ORIGIN_DENIED'));
  }
});
