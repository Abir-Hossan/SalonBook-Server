import { Schema, model, models, type Model, type Types } from 'mongoose';

export interface UserRecord {
  _id?: Types.ObjectId;
  name: string;
  email: string;
  image?: string;
  passwordHash?: string;
  googleSubject?: string;
  role: 'customer' | 'admin';
  isBlocked: boolean;
  createdAt?: Date;
}

const userSchema = new Schema<UserRecord>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  googleSubject: { type: String, select: false },
  passwordHash: { type: String, select: false },
  image: { type: String, trim: true, maxlength: 2048 },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer', required: true },
  isBlocked: { type: Boolean, default: false, required: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'Users' });
userSchema.index({ googleSubject: 1 }, { unique: true, sparse: true, name: 'users_google_unique' });
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({ role: 1, isBlocked: 1, createdAt: -1 }, { name: 'users_admin_listing' });
export const UserModel: Model<UserRecord> = (models.User as Model<UserRecord> | undefined) ?? model<UserRecord>('User', userSchema);
