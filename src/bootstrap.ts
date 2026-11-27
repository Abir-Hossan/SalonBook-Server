import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { ServiceModel } from './database/models/service.model';
import { UserModel } from './database/models/user.model';
import { seedMongoCatalog } from './database/repositories/mongo.repositories';
import { demoCatalog } from './repositories/demo-catalog';

async function bootstrap() {
  const action = process.argv[2];
  const email = process.env.SALONBOOK_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!env.MONGODB_DB_NAME || (action !== 'catalog' && (action !== 'admin' || !email))) {
    throw new Error('An explicit database and supported bootstrap action are required.');
  }
  await connectDatabase();
  if (action === 'catalog') {
    await seedMongoCatalog(demoCatalog);
    logger.info({ activeServices: await ServiceModel.countDocuments({ status: 'active' }) }, 'Initial catalogue ensured');
  } else {
    const result = await UserModel.updateOne({ email, isBlocked: false }, { $set: { role: 'admin' } });
    if (!result.matchedCount) throw new Error('The existing account is missing or blocked.');
    logger.info('Administrator role ensured for the configured account');
  }
}

void bootstrap().catch((error: unknown) => {
  logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'SalonBook bootstrap failed');
  process.exitCode = 1;
}).finally(() => disconnectDatabase());
