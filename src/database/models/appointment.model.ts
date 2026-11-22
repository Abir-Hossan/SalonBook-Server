import { Schema, model, models, type Model, type Types } from 'mongoose';

export interface AppointmentRecord {
  _id?: Types.ObjectId;
  serviceId: Types.ObjectId;
  customerId: Types.ObjectId;
  appointmentDate: string;
  timeSlot: string;
  message?: string;
  servicePrice: number;
  paymentStatus: 'unpaid' | 'paid';
  status: 'pending' | 'confirmed' | 'cancelled';
  checkoutAttempt?: string;
  checkoutStartedAt?: Date;
  checkoutSessionId?: string;
  activeSlotKey?: string | null;
  createdAt?: Date;
}

const appointmentSchema = new Schema<AppointmentRecord>({
  serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  timeSlot: { type: String, required: true, trim: true, maxlength: 40 },
  message: { type: String, trim: true, maxlength: 1000 },
  servicePrice: { type: Number, required: true, min: 0 },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid', required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending', required: true },
  checkoutAttempt: String,
  checkoutStartedAt: Date,
  checkoutSessionId: String,
  activeSlotKey: { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'Appointments' });
appointmentSchema.pre('validate', function setActiveSlotKey() {
  this.activeSlotKey = this.status === 'cancelled' ? undefined : `${this.appointmentDate}|${this.timeSlot}`;
});
appointmentSchema.index({ activeSlotKey: 1 }, { unique: true, partialFilterExpression: { activeSlotKey: { $type: 'string' } }, name: 'appointments_active_slot_unique' });
appointmentSchema.index({ customerId: 1, createdAt: -1 }, { name: 'appointments_customer_created' });
appointmentSchema.index({ status: 1, appointmentDate: 1 }, { name: 'appointments_status_date' });
appointmentSchema.index({ serviceId: 1 }, { name: 'appointments_service' });
export const AppointmentModel: Model<AppointmentRecord> = (models.Appointment as Model<AppointmentRecord> | undefined) ?? model<AppointmentRecord>('Appointment', appointmentSchema);
