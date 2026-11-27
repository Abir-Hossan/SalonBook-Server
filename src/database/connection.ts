import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { startupStep } from '../utils/startup-error';
import { UserModel } from './models/user.model';
import { ServiceModel } from './models/service.model';
import { AppointmentModel } from './models/appointment.model';
import { TransactionModel } from './models/transaction.model';

let initialized = false;
let initializing: Promise<void> | undefined;

async function initializeDatabase(): Promise<void> {
  const uri = await startupStep('mongodb.configure', () => {
    if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required to start SalonBook with MongoDB persistence.');
    return env.MONGODB_URI;
  });
  if (mongoose.connection.readyState !== 1) {
    await startupStep('mongodb.connect', async () => {
      mongoose.set('strictQuery', true);
      await mongoose.connect(uri, {
        dbName: env.MONGODB_DB_NAME || undefined,
        serverSelectionTimeoutMS: 10_000,
        // Explicit index creation below gives each collection an attributable result.
        autoCreate: false,
        autoIndex: false,
      });
    });
  }
  for (const model of [UserModel, ServiceModel, AppointmentModel, TransactionModel]) {
    await startupStep('mongodb.indexes.' + model.collection.name, () => model.createIndexes());
  }
  initialized = true;
  logger.info('MongoDB connected and application indexes ensured');
}

export async function connectDatabase(): Promise<void> {
  if (initialized && mongoose.connection.readyState === 1) return;
  initializing ??= initializeDatabase().finally(() => { initializing = undefined; });
  await initializing;
}

export async function disconnectDatabase(): Promise<void> {
  initialized = false;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return initialized && mongoose.connection.readyState === 1;
}
