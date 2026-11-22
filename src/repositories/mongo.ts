import mongoose from 'mongoose';
import type { Appointment, PageMeta, PageResult, Service, Transaction, User } from '../types/domain';
import type { AppointmentFilters, AppointmentRepository, ServiceFilters, ServiceRepository, TransactionFilters, TransactionRepository, UserFilters, UserRepository } from '../interfaces/repositories';
import { AppointmentModel, ServiceModel, TransactionModel, UserModel } from '../models';
import { AppError } from '../utils/errors';

type MongoDoc = { _id: unknown; name: string; email: string; image: string; role: User['role']; isBlocked: boolean; serviceName: string; category: string; description: string; price: number; duration: number; status: Service['status']; serviceId: unknown; customerId: string; appointmentDate: string; timeSlot: string; message?: string; servicePrice: number; paymentStatus: Appointment['paymentStatus']; appointmentId: unknown; amount: number; currency: string; stripeSessionId?: string; createdAt: string; };
const pageResult = <T>(items: T[], page: number, limit: number, total: number): PageResult<T> => {
  const meta: PageMeta = { page, limit, total, totalPages: Math.ceil(total / limit) };
  return { items, meta };
};
const validObjectId = (id: string) => mongoose.isValidObjectId(id);
const serviceFrom = (doc: MongoDoc): Service => ({ id: String(doc._id), serviceName: doc.serviceName, category: doc.category, description: doc.description, price: doc.price, duration: doc.duration, image: doc.image, status: doc.status, createdAt: doc.createdAt });
const appointmentFrom = (doc: MongoDoc): Appointment => ({ id: String(doc._id), serviceId: String(doc.serviceId), customerId: doc.customerId, appointmentDate: doc.appointmentDate, timeSlot: doc.timeSlot, ...(doc.message ? { message: doc.message } : {}), servicePrice: doc.servicePrice, paymentStatus: doc.paymentStatus, status: doc.status, createdAt: doc.createdAt });
const userFrom = (doc: MongoDoc): User => ({ id: String(doc._id), name: doc.name, email: doc.email, ...(doc.image ? { image: doc.image } : {}), role: doc.role, isBlocked: doc.isBlocked, createdAt: doc.createdAt });
const transactionFrom = (doc: MongoDoc): Transaction => ({ id: String(doc._id), appointmentId: String(doc.appointmentId), customerId: doc.customerId, amount: doc.amount, currency: doc.currency, ...(doc.stripeSessionId ? { stripeSessionId: doc.stripeSessionId } : {}), status: doc.status, createdAt: doc.createdAt });
const isDuplicateKey = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
const slotKey = (date: string, timeSlot: string) => `${date}|${timeSlot}`;

export class MongoServiceRepository implements ServiceRepository {
  async listActiveCategories() { return ServiceModel.distinct('category', { status: 'active' }).then((items) => items.sort((a, b) => a.localeCompare(b))); }
  async list(f: ServiceFilters) {
    const filter: Record<string, unknown> = {};
    if (!f.includeInactive) filter.status = 'active';
    if (f.q) filter.serviceName = { $regex: escapeRegex(f.q), $options: 'i' };
    if (f.category) filter.category = { $regex: `^${escapeRegex(f.category)}$`, $options: 'i' };
    if (f.minPrice !== undefined || f.maxPrice !== undefined) filter.price = { ...(f.minPrice !== undefined ? { $gte: f.minPrice } : {}), ...(f.maxPrice !== undefined ? { $lte: f.maxPrice } : {}) };
    const sort = f.sort === 'price_asc' ? { price: 1 } : f.sort === 'price_desc' ? { price: -1 } : { createdAt: -1 };
    const [docs, total] = await Promise.all([ServiceModel.find(filter).sort(sort).skip((f.page - 1) * f.limit).limit(f.limit).lean(), ServiceModel.countDocuments(filter)]);
    return pageResult(docs.map(serviceFrom), f.page, f.limit, total);
  }
  async findById(id: string) { if (!validObjectId(id)) return null; const doc = await ServiceModel.findById(id).lean(); return doc ? serviceFrom(doc) : null; }
  async create(input: Omit<Service, 'id' | 'createdAt'>) { const doc = await ServiceModel.create({ ...input, createdAt: new Date().toISOString() }); return serviceFrom(doc); }
  async update(id: string, patch: Partial<Omit<Service, 'id' | 'createdAt'>>) { if (!validObjectId(id)) return null; const doc = await ServiceModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean(); return doc ? serviceFrom(doc) : null; }
  async delete(id: string) { if (!validObjectId(id)) return false; return (await ServiceModel.deleteOne({ _id: id })).deletedCount === 1; }
  async hasAppointments(id: string) { if (!validObjectId(id)) return false; return AppointmentModel.exists({ serviceId: id }).then(Boolean); }
}

export class MongoAppointmentRepository implements AppointmentRepository {
  async list(f: AppointmentFilters) {
    const filter: Record<string, unknown> = {};
    if (f.customerId) filter.customerId = f.customerId;
    if (f.status) filter.status = f.status;
    if (f.paymentStatus) filter.paymentStatus = f.paymentStatus;
    if (f.dateFrom || f.dateTo) filter.appointmentDate = { ...(f.dateFrom ? { $gte: f.dateFrom } : {}), ...(f.dateTo ? { $lte: f.dateTo } : {}) };
    const [docs, total] = await Promise.all([AppointmentModel.find(filter).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(), AppointmentModel.countDocuments(filter)]);
    return pageResult(docs.map(appointmentFrom), f.page, f.limit, total);
  }
  async findById(id: string) { if (!validObjectId(id)) return null; const doc = await AppointmentModel.findById(id).lean(); return doc ? appointmentFrom(doc) : null; }
  async create(input: Omit<Appointment, 'id' | 'createdAt'>) {
    if (!validObjectId(input.serviceId)) throw new AppError(422, 'Service identifier is invalid.', 'INVALID_SERVICE_ID');
    try {
      const doc = await AppointmentModel.create({ ...input, activeSlotKey: input.status === 'cancelled' ? null : slotKey(input.appointmentDate, input.timeSlot), createdAt: new Date().toISOString() });
      return appointmentFrom(doc);
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT');
      throw error;
    }
  }
  async update(id: string, patch: Partial<Appointment>) {
    if (!validObjectId(id)) return null;
    const current = await AppointmentModel.findById(id).lean();
    if (!current) return null;
    const safePatch: Record<string, unknown> = { ...patch };
    delete safePatch.id; delete safePatch.createdAt;
    const nextStatus = patch.status ?? current.status;
    const nextDate = patch.appointmentDate ?? current.appointmentDate;
    const nextTime = patch.timeSlot ?? current.timeSlot;
    safePatch.activeSlotKey = nextStatus === 'cancelled' ? null : slotKey(nextDate, nextTime);
    try {
      const doc = await AppointmentModel.findByIdAndUpdate(id, { $set: safePatch }, { new: true, runValidators: true }).lean();
      return doc ? appointmentFrom(doc) : null;
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT');
      throw error;
    }
  }
  async transition(id: string, from: Appointment['status'][], to: Appointment['status']) {
    if (!validObjectId(id)) return null;
    const current = await AppointmentModel.findOne({ _id: id, status: { $in: from } }).lean();
    if (!current) return null;
    try {
      const doc = await AppointmentModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { status: to, activeSlotKey: to === 'cancelled' ? null : slotKey(current.appointmentDate, current.timeSlot) } }, { new: true, runValidators: true }).lean();
      return doc ? appointmentFrom(doc) : null;
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT');
      throw error;
    }
  }
  async findActiveSlot(date: string, timeSlot: string) { const doc = await AppointmentModel.findOne({ activeSlotKey: slotKey(date, timeSlot) }).lean(); return doc ? appointmentFrom(doc) : null; }
  async hasServiceAppointments(serviceId: string) { if (!validObjectId(serviceId)) return false; return AppointmentModel.exists({ serviceId }).then(Boolean); }
}

export class MongoUserRepository implements UserRepository {
  async list(f: UserFilters) {
    const filter: Record<string, unknown> = {};
    if (f.q) filter.$or = [{ name: { $regex: escapeRegex(f.q), $options: 'i' } }, { email: { $regex: escapeRegex(f.q), $options: 'i' } }];
    if (f.role) filter.role = f.role;
    if (f.isBlocked !== undefined) filter.isBlocked = f.isBlocked;
    const [docs, total] = await Promise.all([UserModel.find(filter).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(), UserModel.countDocuments(filter)]);
    return pageResult(docs.map(userFrom), f.page, f.limit, total);
  }
  async findById(id: string) { const doc = await UserModel.findById(id).lean(); return doc ? userFrom(doc) : null; }
  async update(id: string, patch: Partial<Pick<User, 'name' | 'image' | 'isBlocked'>>) { const doc = await UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean(); return doc ? userFrom(doc) : null; }
}

export class MongoTransactionRepository implements TransactionRepository {
  async list(f: TransactionFilters) {
    const filter: Record<string, unknown> = {};
    if (f.status) filter.status = f.status;
    if (f.customerId) filter.customerId = f.customerId;
    if (f.appointmentId && validObjectId(f.appointmentId)) filter.appointmentId = f.appointmentId;
    const [docs, total] = await Promise.all([TransactionModel.find(filter).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(), TransactionModel.countDocuments(filter)]);
    return pageResult(docs.map(transactionFrom), f.page, f.limit, total);
  }
  async findById(id: string) { if (!validObjectId(id)) return null; const doc = await TransactionModel.findById(id).lean(); return doc ? transactionFrom(doc) : null; }
}

export function createMongoRepositories() {
  return { services: new MongoServiceRepository(), appointments: new MongoAppointmentRepository(), users: new MongoUserRepository(), transactions: new MongoTransactionRepository() };
}

export async function seedMongoCatalog(seed: Service[]): Promise<void> {
  for (const item of seed) {
    await ServiceModel.updateOne({ _id: item.id }, { $setOnInsert: { _id: item.id, serviceName: item.serviceName, category: item.category, description: item.description, price: item.price, duration: item.duration, image: item.image, status: item.status, createdAt: item.createdAt } }, { upsert: true, runValidators: true });
  }
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
