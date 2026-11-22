import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserModel } from './models/user.model';
import { ServiceModel } from './models/service.model';
import { AppointmentModel } from './models/appointment.model';
import { TransactionModel } from './models/transaction.model';

let connected = false;

export async function connectDatabase(): Promise<void> {
  if (connected || mongoose.connection.readyState === 1) return;
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required to start SalonBook with MongoDB persistence.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME || undefined,
    serverSelectionTimeoutMS: 10_000,
    autoIndex: env.NODE_ENV !== 'production'
  });
  await Promise.all([UserModel.createIndexes(), ServiceModel.createIndexes(), AppointmentModel.createIndexes(), TransactionModel.createIndexes()]);
  connected = true;
  logger.info({ database: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connected = false;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
