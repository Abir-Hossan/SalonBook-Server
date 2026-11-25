import type { AppointmentRepository, ServiceRepository } from '../../interfaces/repositories'; import type { Principal } from '../../types/domain'; import { AppError } from '../../utils/errors';
import { bookingTimes, salonDate, slotMinutes } from './schedule';
const isRealDate=(value:string)=>{const d=new Date(`${value}T00:00:00.000Z`);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;};
export class AppointmentService {
 constructor(private readonly appointments: AppointmentRepository, private readonly services: ServiceRepository, private readonly timeZone = 'UTC') {}

 async availability(serviceId: string, requestedDate?: string) {
  const today = salonDate(this.timeZone);
  const tomorrow = new Date(today + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const earliestDate = tomorrow.toISOString().slice(0, 10);
  const date = requestedDate ?? earliestDate;
  this.assertFutureDate(date);
  const service = await this.activeService(serviceId);
  return { date, earliestDate, timeZone: this.timeZone, times: await this.availableTimes(date, service.duration) };
 }

 async create(principal: Principal, input: {serviceId:string;appointmentDate:string;timeSlot:string;message?:string}) {
  if (principal.role !== 'customer') throw new AppError(403, 'Only customers can request appointments.', 'CUSTOMER_REQUIRED');
  this.assertFutureDate(input.appointmentDate);
  const timeSlot = input.timeSlot.toUpperCase().replace(/\s+/g, ' ').padStart(8, '0');
  if (!bookingTimes.includes(timeSlot)) throw new AppError(422, 'Choose a time offered by the salon.', 'INVALID_TIME_SLOT');
  const service = await this.activeService(input.serviceId);
  if (!(await this.availableTimes(input.appointmentDate, service.duration)).includes(timeSlot)) {
    throw new AppError(409, 'This time slot is unavailable.', 'APPOINTMENT_SLOT_CONFLICT');
  }
  return this.appointments.create({
    serviceId: service.id, customerId: principal.id, appointmentDate: input.appointmentDate,
    timeSlot, message: input.message, servicePrice: service.price, serviceDuration: service.duration,
    serviceName: service.serviceName, serviceImage: service.image, paymentStatus: 'unpaid', status: 'pending',
  });
 }

 private assertFutureDate(date: string) {
  if (!isRealDate(date) || date <= salonDate(this.timeZone)) {
    throw new AppError(422, 'Appointment date must be a valid future date.', 'INVALID_APPOINTMENT_DATE');
  }
 }

 private async activeService(id: string) {
  const service = await this.services.findById(id);
  if (!service || service.status !== 'active') throw new AppError(404, 'Active service was not found.', 'SERVICE_NOT_AVAILABLE');
  return service;
 }

 private async availableTimes(date: string, duration: number) {
  const rows = await this.appointments.listActiveOnDate(date);
  const legacyServiceIds = [...new Set(rows.filter((row) => !row.serviceDuration).map((row) => row.serviceId))];
  const legacyDurations = new Map(await Promise.all(legacyServiceIds.map(async (id) => [id, (await this.services.findById(id))?.duration] as const)));
  const reserved = rows.map((row) => {
    const start = slotMinutes(row.timeSlot);
    return { start, end: start + (row.serviceDuration ?? legacyDurations.get(row.serviceId) ?? 1) };
  });
  return bookingTimes.filter((time) => {
    const start = slotMinutes(time);
    const end = start + duration;
    return end <= 1440 && !reserved.some((row) => start < row.end && end > row.start);
  });
 }
 async listMine(principal: Principal, query: Parameters<AppointmentRepository['list']>[0]){
  const date = query.upcoming ? salonDate(this.timeZone) : query.dateFrom;
  const result = await this.appointments.list({ ...query, dateFrom: date, customerId: principal.id });
  const ids = [...new Set(result.items.filter((row) => !row.serviceName).map((row) => row.serviceId))];
  const services = new Map(await Promise.all(ids.map(async (id) => [id, await this.services.findById(id)] as const)));
  return { ...result, items: result.items.map((row) => {
    const service = services.get(row.serviceId);
    return service ? { ...row, serviceName: service.serviceName, serviceImage: service.image } : row;
  }) };
 }
 listAll(query:Parameters<AppointmentRepository['list']>[0]){return this.appointments.list({...query,dateFrom:query.upcoming?salonDate(this.timeZone):query.dateFrom});}
 async get(principal:Principal,id:string){const item=await this.appointments.findById(id);if(!item||(item.customerId!==principal.id&&principal.role!=='admin'))throw new AppError(404,'Appointment was not found.','APPOINTMENT_NOT_FOUND');return item;}
 async cancelByCustomer(principal:Principal,id:string){const item=await this.get(principal,id);if(item.customerId!==principal.id)throw new AppError(404,'Appointment was not found.','APPOINTMENT_NOT_FOUND');if(item.status!=='pending')throw new AppError(422,'Customers may cancel pending appointments only.','INVALID_APPOINTMENT_TRANSITION');return this.changeStatus(id,['pending'],'cancelled');}
 async confirm(id:string){const item=await this.require(id);if(item.status!=='pending')throw new AppError(422,'Only pending appointments can be confirmed.','INVALID_APPOINTMENT_TRANSITION');return this.changeStatus(id,['pending'],'confirmed');}
 async cancelByAdmin(id:string){const item=await this.require(id);if(!['pending','confirmed'].includes(item.status))throw new AppError(422,'This appointment cannot be cancelled.','INVALID_APPOINTMENT_TRANSITION');if(item.paymentStatus==='paid')throw new AppError(409,'A paid appointment requires payment review before cancellation.','APPOINTMENT_PAID');if(item.checkoutPending)throw new AppError(409,'Release the open checkout before cancelling this appointment.','APPOINTMENT_CHECKOUT_PENDING');return this.changeStatus(id,['pending','confirmed'],'cancelled');}
 async assertCheckoutEligible(principal:Principal,id:string){const item=await this.get(principal,id);if(item.status!=='confirmed'||item.paymentStatus!=='unpaid')throw new AppError(422,'Only confirmed, unpaid appointments are eligible for payment.','PAYMENT_NOT_ELIGIBLE');return item;}
 private async changeStatus(id:string,from:('pending'|'confirmed')[],to:'cancelled'|'confirmed'){ 
  const updated=await this.appointments.transition(id,from,to);
  if(!updated)throw new AppError(422,'The appointment status changed. Refresh and try again.','INVALID_APPOINTMENT_TRANSITION');
  return updated;
 }
 private async require(id:string){const item=await this.appointments.findById(id);if(!item)throw new AppError(404,'Appointment was not found.','APPOINTMENT_NOT_FOUND');return item;}
}
