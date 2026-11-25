import { randomBytes } from 'node:crypto';
import { AppError } from '../utils/errors';
import { reservationKeys, slotMinutes } from '../modules/appointments/schedule';
import type { Appointment, PageMeta, PageResult, Service, Transaction, User } from '../types/domain';
import type { AppointmentFilters, AppointmentRepository, ServiceFilters, ServiceRepository, TransactionFilters, TransactionRepository, UserFilters, UserRepository } from '../interfaces/repositories';
const page = <T>(items: T[], pageNumber: number, limit: number): PageResult<T> => {
  const total = items.length; const start = (pageNumber - 1) * limit;
  const meta: PageMeta = { page: pageNumber, limit, total, totalPages: Math.ceil(total / limit) };
  return { items: items.slice(start, start + limit), meta };
};
export class MemoryServiceRepository implements ServiceRepository {
  private readonly records = new Map<string, Service>();
  private appointmentLookup: (serviceId: string) => Promise<boolean> = async () => false;
  setAppointmentLookup(lookup: (serviceId: string) => Promise<boolean>): void { this.appointmentLookup = lookup; }
  constructor(seed: Service[] = []) { seed.forEach((item) => this.records.set(item.id, { ...item })); }
  async listActiveCategories() {
    return [...new Set([...this.records.values()]
      .filter((service) => service.status === 'active')
      .map((service) => service.category))].sort((left, right) => left.localeCompare(right));
  }
  async list(f: ServiceFilters) {
    const rows = [...this.records.values()].filter((x) => (f.includeInactive || x.status === 'active') && (!f.q || x.serviceName.toLowerCase().includes(f.q.toLowerCase())) && (!f.category || x.category.toLowerCase() === f.category.toLowerCase()) && (f.minPrice === undefined || x.price >= f.minPrice) && (f.maxPrice === undefined || x.price <= f.maxPrice));
    if (f.sort === 'price_asc') rows.sort((a,b) => a.price-b.price); else if (f.sort === 'price_desc') rows.sort((a,b) => b.price-a.price); else if (f.sort === 'newest') rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    return page(rows, f.page, f.limit);
  }
  async findById(id: string) { return this.records.get(id) ?? null; }
  async create(input: Omit<Service,'id'|'createdAt'>) { const item: Service = { ...input, id: cryptoId(), createdAt: new Date().toISOString() }; this.records.set(item.id,item); return item; }
  async update(id: string, patch: Partial<Omit<Service,'id'|'createdAt'>>) { const old=this.records.get(id); if(!old)return null; const next={...old,...patch}; this.records.set(id,next); return next; }
  async delete(id: string) { return this.records.delete(id); }
  async hasAppointments(id: string) { return this.appointmentLookup(id); }
}
export class MemoryAppointmentRepository implements AppointmentRepository {
  private readonly records = new Map<string, Appointment>();
  constructor(seed: Appointment[] = []) { seed.forEach((item) => this.records.set(item.id,{...item})); }
  async list(f: AppointmentFilters) { const rows=[...this.records.values()].filter(x=>(!f.customerId||x.customerId===f.customerId)&&(!f.upcoming||x.status!=='cancelled')&&(!f.status||x.status===f.status)&&(!f.q||[x.id,x.serviceName,x.appointmentDate,x.timeSlot,x.status].some(value=>value?.toLowerCase().includes(f.q!.toLowerCase())))&&(!f.paymentStatus||x.paymentStatus===f.paymentStatus)&&(!f.dateFrom||x.appointmentDate>=f.dateFrom)&&(!f.dateTo||x.appointmentDate<=f.dateTo)); rows.sort((a,b)=>f.upcoming ? a.appointmentDate.localeCompare(b.appointmentDate) || slotMinutes(a.timeSlot) - slotMinutes(b.timeSlot) : b.createdAt.localeCompare(a.createdAt)); return page(rows,f.page,f.limit); }
  async findById(id: string) { return this.records.get(id)??null; }
  async create(input: Omit<Appointment,'id'|'createdAt'>) {
    const keys = new Set(reservationKeys(input.appointmentDate, input.timeSlot, input.serviceDuration));
    for (const record of this.records.values()) {
      if (input.status !== 'cancelled' && record.status !== 'cancelled' &&
          record.appointmentDate === input.appointmentDate && (record.timeSlot === input.timeSlot ||
          reservationKeys(record.appointmentDate, record.timeSlot, record.serviceDuration).some((key) => keys.has(key)))) {
        throw new AppError(409, 'This time slot is already reserved.', 'APPOINTMENT_SLOT_CONFLICT');
      }
    }
    const item: Appointment = { ...input, id: cryptoId(), createdAt: new Date().toISOString() };
    this.records.set(item.id, item);
    return item;
  }
  async transition(id: string, from: Appointment['status'][], to: Appointment['status']) {
    const record = this.records.get(id);
    if (!record || !from.includes(record.status)) return null;
    const updated = { ...record, status: to };
    this.records.set(id, updated);
    return updated;
  }
  async update(id:string,patch:Partial<Appointment>) { const old=this.records.get(id); if(!old)return null; const next={...old,...patch}; this.records.set(id,next); return next; }
  async findActiveSlot(date:string,timeSlot:string) { return [...this.records.values()].find(x=>x.appointmentDate===date&&x.timeSlot===timeSlot&&x.status!=='cancelled')??null; }
  async listActiveOnDate(date: string) { return [...this.records.values()].filter((row) => row.appointmentDate === date && row.status !== 'cancelled'); }
  async hasServiceAppointments(serviceId:string) { return [...this.records.values()].some(x=>x.serviceId===serviceId); }
}
export class MemoryUserRepository implements UserRepository {
  private readonly records=new Map<string,User>(); constructor(seed:User[]=[]){seed.forEach(x=>this.records.set(x.id,{...x}));}
  async list(f:UserFilters){const rows=[...this.records.values()].filter(x=>(!f.q||x.name.toLowerCase().includes(f.q.toLowerCase())||x.email.toLowerCase().includes(f.q.toLowerCase()))&&(!f.role||x.role===f.role)&&(f.isBlocked===undefined||x.isBlocked===f.isBlocked));rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return page(rows,f.page,f.limit);}
  async findById(id:string){return this.records.get(id)??null;}
  async update(id:string,patch:Partial<Pick<User,'name'|'image'|'isBlocked'>>){const old=this.records.get(id);if(!old)return null;const next={...old,...patch};this.records.set(id,next);return next;}
}
export class MemoryTransactionRepository implements TransactionRepository {
  private readonly records=new Map<string,Transaction>();constructor(seed:Transaction[]=[]){seed.forEach(x=>this.records.set(x.id,{...x}));}
  async list(f:TransactionFilters){const rows=[...this.records.values()].filter(x=>(!f.status||x.status===f.status)&&(!f.customerId||x.customerId===f.customerId)&&(!f.appointmentId||x.appointmentId===f.appointmentId)&&(!f.q||[x.id,x.appointmentId,x.currency,x.status,x.stripeSessionId].some(value=>value?.toLowerCase().includes(f.q!.toLowerCase()))));rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return page(rows,f.page,f.limit);}
  async findById(id:string){return this.records.get(id)??null;}
}
function cryptoId():string { return randomBytes(12).toString('hex'); }
