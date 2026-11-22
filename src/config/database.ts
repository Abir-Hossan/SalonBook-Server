import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required to start SalonBook with MongoDB persistence.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: env.NODE_ENV !== 'production'
  });
  logger.info({ database: mongoose.connection.name, host: mongoose.connection.host }, 'MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
