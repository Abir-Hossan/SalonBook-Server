import type { Appointment, PageResult, Service, Transaction, User } from '../types/domain';
export interface ListOptions { page: number; limit: number }
export interface ServiceFilters extends ListOptions { q?: string; category?: string; minPrice?: number; maxPrice?: number; sort?: 'price_asc' | 'price_desc' | 'newest'; includeInactive?: boolean }
export interface AppointmentFilters extends ListOptions { status?: string; paymentStatus?: string; dateFrom?: string; dateTo?: string; customerId?: string; q?: string; upcoming?: boolean }
export interface UserFilters extends ListOptions { q?: string; role?: string; isBlocked?: boolean }
export interface TransactionFilters extends ListOptions { status?: string; customerId?: string; appointmentId?: string; q?: string }
export interface ServiceRepository {
  listActiveCategories(): Promise<string[]>;
  list(filters: ServiceFilters): Promise<PageResult<Service>>; findById(id: string): Promise<Service | null>;
  create(input: Omit<Service, 'id' | 'createdAt'>): Promise<Service>; update(id: string, patch: Partial<Omit<Service, 'id' | 'createdAt'>>): Promise<Service | null>;
  delete(id: string): Promise<boolean>; hasAppointments(id: string): Promise<boolean>;
}
export interface AppointmentRepository {
  list(filters: AppointmentFilters): Promise<PageResult<Appointment>>; findById(id: string): Promise<Appointment | null>;
  create(input: Omit<Appointment, 'id' | 'createdAt'>): Promise<Appointment>; update(id: string, patch: Partial<Appointment>): Promise<Appointment | null>;
  transition(id: string, from: Appointment['status'][], to: Appointment['status']): Promise<Appointment | null>;
  findActiveSlot(date: string, timeSlot: string): Promise<Appointment | null>; listActiveOnDate(date: string): Promise<Appointment[]>; hasServiceAppointments(serviceId: string): Promise<boolean>;
}
export interface UserRepository {
  list(filters: UserFilters): Promise<PageResult<User>>; findById(id: string): Promise<User | null>; update(id: string, patch: Partial<Pick<User, 'name' | 'image' | 'isBlocked'>>): Promise<User | null>;
}
export interface TransactionRepository {
  list(filters: TransactionFilters): Promise<PageResult<Transaction>>; findById(id: string): Promise<Transaction | null>;
}
