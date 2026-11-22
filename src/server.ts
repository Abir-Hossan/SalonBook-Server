import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { createMongoRepositories, seedMongoCatalog } from './database/repositories/mongo.repositories';
import { initializeBetterAuth, validateBetterAuthConfig } from './modules/auth/better-auth';
import { SessionModel } from './modules/auth/auth.routes';
import { demoCatalog } from './repositories/demo-catalog';

async function start(): Promise<void> {
  const authConfig = validateBetterAuthConfig();
  await connectDatabase();
  await initializeBetterAuth(authConfig);
  await SessionModel.createIndexes();
  if (env.NODE_ENV === 'development' && env.SEED_DEMO_CATALOG === 'true') {
    await seedMongoCatalog(demoCatalog);
    logger.info({ count: demoCatalog.length }, 'Demo service catalog ensured in MongoDB');
  }
  const app = createApp({ repositories: createMongoRepositories(), enableMongoAuth: true });
  const server = createServer(app);
  server.listen(env.PORT, () => logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'SalonBook API listening'));

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown requested');
    server.close(async (error) => {
      try {
        await disconnectDatabase();
        if (error) { logger.error({ err: error }, 'HTTP server shutdown failed'); process.exitCode = 1; }
        else { logger.info('HTTP server and MongoDB connection closed'); process.exitCode = 0; }
      } catch (disconnectError) {
        logger.error({ err: disconnectError }, 'MongoDB shutdown failed'); process.exitCode = 1;
      }
    });
    setTimeout(() => { logger.error('Forced shutdown after timeout'); process.exit(1); }, 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error: unknown) => {
  logger.fatal({ failure: error instanceof Error ? error.name : 'UnknownError' }, 'SalonBook API failed to start. Check environment, MongoDB connectivity and index permissions.');
  try { await disconnectDatabase(); } catch { logger.error('MongoDB cleanup failed'); }
  process.exitCode = 1;
});
