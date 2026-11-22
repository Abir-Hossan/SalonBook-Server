import { Schema, model, models, type Model, type Types } from 'mongoose';

export interface TransactionRecord {
  _id?: Types.ObjectId;
  appointmentId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
  currency: string;
  stripeSessionId?: string;
  status: 'paid' | 'failed';
  createdAt?: Date;
}

const transactionSchema = new Schema<TransactionRecord>({
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
  stripeSessionId: { type: String, trim: true, sparse: true },
  status: { type: String, enum: ['paid', 'failed'], required: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'Transactions' });
transactionSchema.index({ appointmentId: 1 }, { name: 'transactions_appointment' });
transactionSchema.index({ customerId: 1, createdAt: -1 }, { name: 'transactions_customer_created' });
transactionSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true, name: 'transactions_stripe_session_unique' });
export const TransactionModel: Model<TransactionRecord> = (models.Transaction as Model<TransactionRecord> | undefined) ?? model<TransactionRecord>('Transaction', transactionSchema);
