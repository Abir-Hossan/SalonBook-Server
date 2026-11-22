import pino from 'pino';
import { env } from './env';
export const logger = pino({ level: env.LOG_LEVEL, redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.url', 'req.query.code', 'req.query.state', 'res.headers["set-cookie"]', 'res.headers.location', '*.password', '*.token', '*.secret'], censor: '[REDACTED]' } });
