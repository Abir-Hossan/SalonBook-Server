import { Schema, model, models, type Model, type Types } from 'mongoose';

export interface ServiceRecord {
  _id?: Types.ObjectId;
  serviceName: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  image: string;
  status: 'active' | 'inactive';
  createdAt?: Date;
}

const serviceSchema = new Schema<ServiceRecord>({
  serviceName: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  price: { type: Number, required: true, min: 0 },
  duration: { type: Number, required: true, min: 1, max: 1440 },
  image: { type: String, required: true, trim: true, maxlength: 2048 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'Services' });
serviceSchema.index({ status: 1, category: 1 }, { name: 'services_status_category' });
serviceSchema.index({ serviceName: 'text', description: 'text' }, { name: 'services_text_search' });
serviceSchema.index({ price: 1 }, { name: 'services_price' });
export const ServiceModel: Model<ServiceRecord> = (models.Service as Model<ServiceRecord> | undefined) ?? model<ServiceRecord>('Service', serviceSchema);
