import mongoose, { type FilterQuery } from 'mongoose';
import { AppointmentModel, type AppointmentRecord } from '../models/appointment.model';
import { ServiceModel, type ServiceRecord } from '../models/service.model';
import { TransactionModel, type TransactionRecord } from '../models/transaction.model';
import { UserModel, type UserRecord } from '../models/user.model';
import { AppError } from '../../utils/errors';
import { reservationKeys } from '../../modules/appointments/schedule';
import type { Appointment, PageResult, Service, Transaction, User } from '../../types/domain';
import type { AppointmentFilters, AppointmentRepository, ServiceFilters, ServiceRepository, TransactionFilters, TransactionRepository, UserFilters, UserRepository } from '../../interfaces/repositories';

const validId = (id: string): boolean => mongoose.isValidObjectId(id);
const idOf = (value: unknown): string => String(value);
const asDate = (value: Date | undefined): string => (value ?? new Date()).toISOString();
const pageResult = <T>(items: T[], page: number, limit: number, total: number): PageResult<T> => ({ items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
const serviceDto = (d: ServiceRecord): Service => ({ id: idOf(d._id), serviceName: d.serviceName, category: d.category, description: d.description, price: d.price, duration: d.duration, image: d.image, status: d.status, createdAt: asDate(d.createdAt) });
const userDto = (d: UserRecord): User => ({ id: idOf(d._id), name: d.name, email: d.email, ...(d.image ? { image: d.image } : {}), role: d.role, isBlocked: d.isBlocked, createdAt: asDate(d.createdAt) });
const appointmentDto = (d: AppointmentRecord): Appointment => ({ id: idOf(d._id), serviceId: idOf(d.serviceId), customerId: idOf(d.customerId), appointmentDate: d.appointmentDate, timeSlot: d.timeSlot, ...(d.message ? { message: d.message } : {}), servicePrice: d.servicePrice, serviceDuration: d.serviceDuration, serviceName: d.serviceName, serviceImage: d.serviceImage, checkoutPending: Boolean(d.checkoutAttempt && d.paymentStatus === 'unpaid'), paymentStatus: d.paymentStatus, status: d.status, createdAt: asDate(d.createdAt) });
const transactionDto = (d: TransactionRecord): Transaction => ({ id: idOf(d._id), appointmentId: idOf(d.appointmentId), customerId: idOf(d.customerId), amount: d.amount, currency: d.currency, ...(d.stripeSessionId ? { stripeSessionId: d.stripeSessionId } : {}), status: d.status, createdAt: asDate(d.createdAt) });

export class MongoServiceRepository implements ServiceRepository {
  async listActiveCategories(): Promise<string[]> {
    const categories = await ServiceModel.distinct('category', { status: 'active' });
    return (categories as string[]).sort((a, b) => a.localeCompare(b));
  }
  async list(f: ServiceFilters): Promise<PageResult<Service>> {
    const q: FilterQuery<ServiceRecord> = {};
    if (!f.includeInactive) q.status = 'active';
    if (f.q) q.serviceName = { $regex: escapeRegex(f.q), $options: 'i' };
    if (f.category) q.category = new RegExp(`^${escapeRegex(f.category)}$`, 'i');
    if (f.minPrice !== undefined || f.maxPrice !== undefined) q.price = { ...(f.minPrice !== undefined ? { $gte: f.minPrice } : {}), ...(f.maxPrice !== undefined ? { $lte: f.maxPrice } : {}) };
const sort: Record<string, 1 | -1> = {};

if (f.sort === 'price_asc') {
  sort.price = 1;
} else if (f.sort === 'price_desc') {
  sort.price = -1;
} else if (f.sort === 'newest') {
  sort.createdAt = -1;
} else {
  sort.serviceName = 1;
}    const [docs, total] = await Promise.all([ServiceModel.find(q).sort(sort).skip((f.page - 1) * f.limit).limit(f.limit).lean().exec(), ServiceModel.countDocuments(q).exec()]);
    return pageResult(docs.map((doc) => serviceDto(doc)), f.page, f.limit, total);
  }
  async findById(id: string): Promise<Service | null> { if (!validId(id)) return null; const doc = await ServiceModel.findById(id).lean().exec(); return doc ? serviceDto(doc) : null; }
  async create(input: Omit<Service, 'id' | 'createdAt'>): Promise<Service> { const doc = await ServiceModel.create(input); return serviceDto(doc); }
  async update(id: string, patch: Partial<Omit<Service, 'id' | 'createdAt'>>): Promise<Service | null> { if (!validId(id)) return null; const doc = await ServiceModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean().exec(); return doc ? serviceDto(doc) : null; }
  async delete(id: string): Promise<boolean> { if (!validId(id)) return false; const result = await ServiceModel.deleteOne({ _id: id }).exec(); return result.deletedCount === 1; }
  async hasAppointments(id: string): Promise<boolean> { return validId(id) && AppointmentModel.exists({ serviceId: id }).then(Boolean); }
}

export class MongoAppointmentRepository implements AppointmentRepository {
  async list(f: AppointmentFilters): Promise<PageResult<Appointment>> {
    const q: FilterQuery<AppointmentRecord> = {};
    if (f.customerId !== undefined) {
      if (!validId(f.customerId)) return pageResult([], f.page, f.limit, 0);
      q.customerId = new mongoose.Types.ObjectId(f.customerId);
    }
    if (f.upcoming) q.status = { $ne: 'cancelled' };
    else if (f.status) q.status = f.status;
    if (f.paymentStatus) q.paymentStatus = f.paymentStatus;
    if (f.dateFrom || f.dateTo) q.appointmentDate = { ...(f.dateFrom ? { $gte: f.dateFrom } : {}), ...(f.dateTo ? { $lte: f.dateTo } : {}) };
    if (f.q) {
      const pattern = new RegExp(escapeRegex(f.q), 'i');
      const serviceIds = await ServiceModel.distinct('_id', { serviceName: pattern });
      q.$or = [{ serviceName: pattern }, { serviceId: { $in: serviceIds } }, { appointmentDate: pattern }, { timeSlot: pattern }, { status: pattern }];
      if (validId(f.q)) q.$or.push({ _id: f.q });
    }
    const sort: Record<string, 1 | -1> = f.upcoming ? { appointmentDate: 1, _id: 1 } : { createdAt: -1, _id: -1 };
    const [docs, total] = await Promise.all([AppointmentModel.find(q).sort(sort).skip((f.page - 1) * f.limit).limit(f.limit).lean().exec(), AppointmentModel.countDocuments(q).exec()]);
    return pageResult(docs.map((doc) => appointmentDto(doc)), f.page, f.limit, total);
  }
  async findById(id: string): Promise<Appointment | null> { if (!validId(id)) return null; const doc = await AppointmentModel.findById(id).lean().exec(); return doc ? appointmentDto(doc) : null; }
  async create(input: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment> {
    if (!validId(input.serviceId) || !validId(input.customerId)) throw new AppError(400, 'Invalid service or customer reference.', 'INVALID_REFERENCE');
    try { const doc = await AppointmentModel.create({ ...input, serviceId: new mongoose.Types.ObjectId(input.serviceId), customerId: new mongoose.Types.ObjectId(input.customerId), activeSlotKey: input.status === 'cancelled' ? undefined : `${input.appointmentDate}|${input.timeSlot}` }); return appointmentDto(doc); }
    catch (error) { if (isDuplicateKey(error)) throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT'); throw error; }
  }
  async update(id: string, patch: Partial<Appointment>): Promise<Appointment | null> {
    if (!validId(id)) return null;
    const update: Record<string, unknown> = { ...patch };
    const unset: Record<string, string> = {};
    delete update.id; delete update.createdAt;
    if (patch.status || patch.appointmentDate || patch.timeSlot || patch.serviceDuration !== undefined) {
      const old = await AppointmentModel.findById(id).lean().exec(); if (!old) return null;
      const status = patch.status ?? old.status; const date = patch.appointmentDate ?? old.appointmentDate; const slot = patch.timeSlot ?? old.timeSlot;
      update.activeSlotKey = status === 'cancelled' ? null : `${date}|${slot}`;
      const keys = status === 'cancelled' ? [] : reservationKeys(date, slot, patch.serviceDuration ?? old.serviceDuration);
      if (keys.length) update.activeMinuteKeys = keys;
      else unset.activeMinuteKeys = '';
    }
    try { const doc = await AppointmentModel.findByIdAndUpdate(id, { $set: update, $unset: unset }, { new: true, runValidators: true }).lean().exec(); return doc ? appointmentDto(doc) : null; }
    catch (error) { if (isDuplicateKey(error)) throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT'); throw error; }
  }
  
async transition(
  id: string,
  from: Appointment['status'][],
  to: Appointment['status']
): Promise<Appointment | null> {
  if (!validId(id)) return null;

  const current = await AppointmentModel.findOne({
    _id: id,
    status: { $in: from }
  }).lean().exec();

  if (!current) return null;

  try {
    const doc = await AppointmentModel.findOneAndUpdate(
      {
        _id: id,
        status: { $in: from },
        ...(to === 'cancelled' ? { paymentStatus: 'unpaid', checkoutAttempt: { $exists: false } } : {})
      },
      {
        $set: {
          status: to,
          activeSlotKey:
            to === 'cancelled'
              ? null
              : `${current.appointmentDate}|${current.timeSlot}`
        },
        ...(to === 'cancelled' ? { $unset: { activeMinuteKeys: '' } } : {})
      },
      {
        new: true,
        runValidators: true
      }
    ).lean().exec();

    return doc ? appointmentDto(doc) : null;
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(
        409,
        'This time slot is already reserved.',
        'APPOINTMENT_SLOT_CONFLICT'
      );
    }

    throw error;
  }
}

  async findActiveSlot(date: string, timeSlot: string): Promise<Appointment | null> { const doc = await AppointmentModel.findOne({ appointmentDate: date, timeSlot, status: { $ne: 'cancelled' } }).lean().exec(); return doc ? appointmentDto(doc) : null; }
  async listActiveOnDate(date: string): Promise<Appointment[]> {
    const rows = await AppointmentModel.find({ appointmentDate: date, status: { $ne: 'cancelled' } }).lean().exec();
    return rows.map(appointmentDto);
  }
  async hasServiceAppointments(serviceId: string): Promise<boolean> { return validId(serviceId) && AppointmentModel.exists({ serviceId }).then(Boolean); }
}

export class MongoUserRepository implements UserRepository {
  async list(f: UserFilters): Promise<PageResult<User>> {
    const q: FilterQuery<UserRecord> = {};
    if (f.q) q.$or = [{ name: { $regex: escapeRegex(f.q), $options: 'i' } }, { email: { $regex: escapeRegex(f.q), $options: 'i' } }];
    if (f.role) q.role = f.role;
    if (f.isBlocked !== undefined) q.isBlocked = f.isBlocked;
    const [docs, total] = await Promise.all([UserModel.find(q).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean().exec(), UserModel.countDocuments(q).exec()]);
    return pageResult(docs.map((doc) => userDto(doc)), f.page, f.limit, total);
  }
  async findById(id: string): Promise<User | null> { if (!validId(id)) return null; const doc = await UserModel.findById(id).lean().exec(); return doc ? userDto(doc) : null; }
  async update(id: string, patch: Partial<Pick<User, 'name' | 'image' | 'isBlocked'>>): Promise<User | null> { if (!validId(id)) return null; const doc = await UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean().exec(); return doc ? userDto(doc) : null; }
}

export class MongoTransactionRepository implements TransactionRepository {
  async list(f: TransactionFilters): Promise<PageResult<Transaction>> {
    const q: FilterQuery<TransactionRecord> = {};
    if (f.status) q.status = f.status;
    if (f.customerId !== undefined) {
      if (!validId(f.customerId)) return pageResult([], f.page, f.limit, 0);
      q.customerId = new mongoose.Types.ObjectId(f.customerId);
    }
    if (f.appointmentId && validId(f.appointmentId)) q.appointmentId = new mongoose.Types.ObjectId(f.appointmentId);
    if (f.q) {
      const pattern = new RegExp(escapeRegex(f.q), 'i');
      q.$or = [{ currency: pattern }, { status: pattern }, { stripeSessionId: pattern }];
      if (validId(f.q)) q.$or.push({ _id: f.q }, { appointmentId: f.q });
    }
    const [docs, total] = await Promise.all([TransactionModel.find(q).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean().exec(), TransactionModel.countDocuments(q).exec()]);
    return pageResult(docs.map((doc) => transactionDto(doc)), f.page, f.limit, total);
  }
  async findById(id: string): Promise<Transaction | null> { if (!validId(id)) return null; const doc = await TransactionModel.findById(id).lean().exec(); return doc ? transactionDto(doc) : null; }
}

export const createMongoRepositories = () => ({ services: new MongoServiceRepository(), appointments: new MongoAppointmentRepository(), users: new MongoUserRepository(), transactions: new MongoTransactionRepository() });
export async function seedMongoCatalog(items: Service[]): Promise<void> {
  if (!items.length) return;
  const operations = items.map((item) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(item.id) }, update: { $setOnInsert: { serviceName: item.serviceName, category: item.category, description: item.description, price: item.price, duration: item.duration, image: item.image, status: item.status, createdAt: new Date(item.createdAt) } }, upsert: true } }));
  await ServiceModel.bulkWrite(operations, { ordered: false });
}
function isDuplicateKey(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000); }
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
