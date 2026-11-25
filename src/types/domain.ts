export type Role = 'customer' | 'admin';
export type ServiceStatus = 'active' | 'inactive';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';
export type TransactionStatus = 'paid' | 'failed';

export interface Service {
  id: string; serviceName: string; category: string; description: string;
  price: number; duration: number; image: string; status: ServiceStatus; createdAt: string;
}
export interface Appointment {
  id: string; serviceId: string; customerId: string; appointmentDate: string;
  timeSlot: string; message?: string; servicePrice: number;
  serviceDuration?: number; serviceName?: string; serviceImage?: string;
  paymentStatus: PaymentStatus; status: AppointmentStatus; createdAt: string;
}
export interface User {
  id: string; name: string; email: string; image?: string;
  role: Role; isBlocked: boolean; createdAt: string;
}
export interface Transaction {
  id: string; appointmentId: string; customerId: string; amount: number;
  currency: string; stripeSessionId?: string; status: TransactionStatus; createdAt: string;
}
export interface Principal { id: string; role: Role; isBlocked: boolean; email?: string }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface PageResult<T> { items: T[]; meta: PageMeta }
