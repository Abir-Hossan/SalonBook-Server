import mongoose, { Schema, type Model } from 'mongoose';

type MongoRecord = {
  _id: string; name: string; email: string; image: string; role: 'customer' | 'admin'; isBlocked: boolean;
  serviceName: string; category: string; description: string; price: number; duration: number; status: 'active' | 'inactive';
  serviceId: mongoose.Types.ObjectId; customerId: string; appointmentDate: string; timeSlot: string; message?: string; servicePrice: number;
  paymentStatus: 'unpaid' | 'paid'; appointmentId: mongoose.Types.ObjectId; amount: number; currency: string; stripeSessionId?: string;
  createdAt: string; activeSlotKey?: string | null;
};

const options = { versionKey: false, strict: 'throw' as const };

const userSchema = new Schema({
  _id: { type: String, required: true }, name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 }, image: { type: String, trim: true },
  role: { type: String, enum: ['customer', 'admin'], required: true, default: 'customer' },
  isBlocked: { type: Boolean, required: true, default: false }, createdAt: { type: String, required: true }
}, options);
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });

const serviceSchema = new Schema({
  serviceName: { type: String, required: true, trim: true, maxlength: 160 }, category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, maxlength: 3000 }, price: { type: Number, required: true, min: 0 },
  duration: { type: Number, required: true, min: 1, max: 1440 }, image: { type: String, required: true, maxlength: 2048 },
  status: { type: String, enum: ['active', 'inactive'], required: true, default: 'active' }, createdAt: { type: String, required: true }
}, options);
serviceSchema.index({ status: 1, category: 1 });

const appointmentSchema = new Schema({
  serviceId: { type: Schema.Types.ObjectId, required: true, ref: 'SalonBookService' }, customerId: { type: String, required: true, trim: true },
  appointmentDate: { type: String, required: true }, timeSlot: { type: String, required: true, trim: true }, message: { type: String, maxlength: 1000 },
  servicePrice: { type: Number, required: true, min: 0 }, paymentStatus: { type: String, enum: ['unpaid', 'paid'], required: true, default: 'unpaid' },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], required: true, default: 'pending' },
  activeSlotKey: { type: String, default: null }, createdAt: { type: String, required: true }
}, options);
appointmentSchema.index({ activeSlotKey: 1 }, { unique: true, name: 'appointments_active_slot_unique', partialFilterExpression: { activeSlotKey: { $type: 'string' } } });
appointmentSchema.index({ customerId: 1, createdAt: -1 });
appointmentSchema.index({ status: 1, appointmentDate: 1 });
appointmentSchema.index({ serviceId: 1 });

const transactionSchema = new Schema({
  appointmentId: { type: Schema.Types.ObjectId, required: true, ref: 'SalonBookAppointment' }, customerId: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 }, currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  stripeSessionId: { type: String, trim: true }, status: { type: String, enum: ['paid', 'failed'], required: true }, createdAt: { type: String, required: true }
}, options);
transactionSchema.index({ appointmentId: 1 });
transactionSchema.index({ customerId: 1, createdAt: -1 });
transactionSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

function model<T>(name: string, schema: Schema, collection: string): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema, collection);
}
export const UserModel = model<MongoRecord>('SalonBookUser', userSchema, 'Users');
export const ServiceModel = model<MongoRecord>('SalonBookService', serviceSchema, 'Services');
export const AppointmentModel = model<MongoRecord>('SalonBookAppointment', appointmentSchema, 'Appointments');
export const TransactionModel = model<MongoRecord>('SalonBookTransaction', transactionSchema, 'Transactions');
