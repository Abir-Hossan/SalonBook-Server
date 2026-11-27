import { once } from 'node:events';
import { createServer } from 'node:http';
import { reportStartupFailure, startupStep } from './utils/startup-error';

let disconnectDatabase: (() => Promise<void>) | undefined;

async function start(): Promise<void> {
  const { env } = await startupStep('environment.validate', () => import('./config/env.js'));
  const { logger } = await startupStep('logging.initialize', () => import('./config/logger.js'));
  const database = await startupStep('mongodb.load', () => import('./database/connection.js'));
  disconnectDatabase = database.disconnectDatabase;
  const { initializeBetterAuth, validateBetterAuthConfig } = await startupStep('auth.load', () => import('./modules/auth/better-auth.js'));
  const authConfig = await startupStep('auth.validate', validateBetterAuthConfig);

  await database.connectDatabase();
  await startupStep('auth.initialize', () => initializeBetterAuth(authConfig));
  const { SessionModel } = await startupStep('auth.legacy.load', () => import('./modules/auth/auth.routes.js'));
  await startupStep('mongodb.indexes.CustomerSessions', () => SessionModel.createIndexes());

  const { createMongoRepositories, seedMongoCatalog } = await startupStep('repositories.load', () => import('./database/repositories/mongo.repositories.js'));
  if (env.SEED_DEMO_CATALOG === 'true') {
    const { demoCatalog } = await startupStep('catalogue.load', () => import('./repositories/demo-catalog.js'));
    await startupStep('catalogue.seed', () => seedMongoCatalog(demoCatalog));
    logger.info({ count: demoCatalog.length }, 'Demo service catalog ensured in MongoDB');
  }
  const { createApp } = await startupStep('http.load', () => import('./app.js'));
  const app = await startupStep('http.initialize', () => createApp({ repositories: createMongoRepositories(), enableMongoAuth: true }));
  const server = createServer(app);
  await startupStep('http.listen', async () => {
    server.listen(env.PORT, '0.0.0.0');
    await once(server, 'listening');
  });
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'SalonBook API listening');

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown requested');
    const timeout = setTimeout(() => { logger.error('Forced shutdown after timeout'); process.exit(1); }, 10_000).unref();
    server.close(async (error) => {
      try {
        await database.disconnectDatabase();
        if (error) { logger.error({ errorName: error.name }, 'HTTP server shutdown failed'); process.exitCode = 1; }
        else { logger.info('HTTP server and MongoDB connection closed'); process.exitCode = 0; }
      } catch {
        logger.error('MongoDB shutdown failed');
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void start().catch(async (error: unknown) => {
  process.exitCode = 1;
  reportStartupFailure('startup', error);
  try { await disconnectDatabase?.(); } catch (cleanupError) { reportStartupFailure('mongodb.cleanup', cleanupError); }
});
