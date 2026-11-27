import {describe,it,expect,beforeEach} from 'vitest';import {MemoryAppointmentRepository,MemoryServiceRepository} from '../../src/repositories/memory';import {AppointmentService} from '../../src/modules/appointments/appointment.service';import {appointmentSeed,customer,admin,serviceSeed,ids} from '../fixtures/data';
let repo:MemoryAppointmentRepository;let service:AppointmentService;beforeEach(()=>{repo=new MemoryAppointmentRepository(appointmentSeed);service=new AppointmentService(repo,new MemoryServiceRepository(serviceSeed));});
const booking={serviceId:ids.service,appointmentDate:'2099-02-01',timeSlot:'11:30 AM'};
describe('AppointmentService',()=>{
it('validates available times and rejects overlap while allowing adjacent services', async () => {
  const longService = { ...serviceSeed[0]!, duration: 120 };
  const scheduler = new AppointmentService(repo, new MemoryServiceRepository([longService]));
  const date = booking.appointmentDate;
  await expect(scheduler.create(customer, { ...booking, timeSlot: '02:15 AM' })).rejects.toMatchObject({ code: 'INVALID_TIME_SLOT' });
  const reservation = await scheduler.create(customer, { ...booking, timeSlot: '09:30 AM' });
  expect((await scheduler.availability(longService.id, date)).times).not.toContain('10:30 AM');
  await expect(scheduler.create(customer, { ...booking, timeSlot: '10:30 AM' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(scheduler.create(customer, { ...booking, timeSlot: '11:30 AM' })).resolves.toMatchObject({ serviceDuration: 120 });
  await scheduler.cancelByCustomer(customer, reservation.id);
  expect((await scheduler.availability(longService.id, date)).times).toContain('09:30 AM');
});
it('accepts only one concurrent booking for the same slot', async () => {
  const results = await Promise.allSettled([
    service.create(customer, { ...booking, timeSlot: '9:30 AM' }),
    service.create(customer, { ...booking, timeSlot: '09:30 AM' }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results).toContainEqual(expect.objectContaining({
    status: 'rejected',
    reason: expect.objectContaining({ statusCode: 409 }),
  }));
});
it('lets only one competing transition leave pending status', async () => {
  const results = await Promise.allSettled([
    service.confirm(ids.appointment),
    service.cancelByCustomer(customer, ids.appointment),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results).toContainEqual(expect.objectContaining({
    status: 'rejected',
    reason: expect.objectContaining({ statusCode: 422 }),
  }));
});
it('creates a pending unpaid appointment and snapshots server price',async()=>{const item=await service.create(customer,booking);expect(item.status).toBe('pending');expect(item.paymentStatus).toBe('unpaid');expect(item.servicePrice).toBe(165);});
it('rejects invalid calendar date',async()=>{await expect(service.create(customer,{...booking,appointmentDate:'2099-02-31'})).rejects.toMatchObject({code:'INVALID_APPOINTMENT_DATE'});});
it('rejects past appointment date',async()=>{await expect(service.create(customer,{...booking,appointmentDate:'2000-01-01'})).rejects.toMatchObject({code:'INVALID_APPOINTMENT_DATE'});});
it('rejects invalid time slot',async()=>{await expect(service.create(customer,{...booking,timeSlot:'tomorrow'})).rejects.toThrow();});
it('rejects invalid or inactive service',async()=>{await expect(service.create(customer,{...booking,serviceId:ids.service2})).rejects.toMatchObject({statusCode:404});});
it('rejects unknown service ID',async()=>{await expect(service.create(customer,{...booking,serviceId:'999999999999999999999999'})).rejects.toMatchObject({statusCode:404});});
it('rejects duplicate active slot',async()=>{await service.create(customer,booking);await expect(service.create(customer,booking)).rejects.toMatchObject({statusCode:409});});
it('allows rebooking a cancelled slot',async()=>{const item=await service.create(customer,booking);await repo.update(item.id,{status:'cancelled'});await expect(service.create(customer,booking)).resolves.toBeTruthy();});
it('rejects non-customer booking',async()=>{await expect(service.create(admin,booking)).rejects.toMatchObject({statusCode:403});});
it('confirms pending appointment',async()=>{expect((await service.confirm(ids.appointment))?.status).toBe('confirmed');});
it('rejects confirming non-pending appointment',async()=>{await repo.update(ids.appointment,{status:'confirmed'});await expect(service.confirm(ids.appointment)).rejects.toMatchObject({statusCode:422});});
it('customer cancels pending appointment',async()=>{expect((await service.cancelByCustomer(customer,ids.appointment))?.status).toBe('cancelled');});
it('customer cannot cancel confirmed appointment',async()=>{await repo.update(ids.appointment,{status:'confirmed'});await expect(service.cancelByCustomer(customer,ids.appointment)).rejects.toMatchObject({statusCode:422});});
it('admin cancels pending appointment',async()=>{expect((await service.cancelByAdmin(ids.appointment))?.status).toBe('cancelled');});
it('admin cancels confirmed appointment',async()=>{await repo.update(ids.appointment,{status:'confirmed'});expect((await service.cancelByAdmin(ids.appointment))?.status).toBe('cancelled');});
it('rejects cancelling already cancelled appointment',async()=>{await repo.update(ids.appointment,{status:'cancelled'});await expect(service.cancelByAdmin(ids.appointment)).rejects.toMatchObject({statusCode:422});});
it('rejects checkout for pending appointment',async()=>{await expect(service.assertCheckoutEligible(customer,ids.appointment)).rejects.toMatchObject({code:'PAYMENT_NOT_ELIGIBLE'});});
it('rejects checkout for cancelled appointment',async()=>{await repo.update(ids.appointment,{status:'cancelled'});await expect(service.assertCheckoutEligible(customer,ids.appointment)).rejects.toMatchObject({code:'PAYMENT_NOT_ELIGIBLE'});});
it('allows checkout eligibility only for confirmed unpaid appointment',async()=>{await repo.update(ids.appointment,{status:'confirmed'});expect((await service.assertCheckoutEligible(customer,ids.appointment)).status).toBe('confirmed');});
it('rejects checkout for already paid appointment',async()=>{await repo.update(ids.appointment,{status:'confirmed',paymentStatus:'paid'});await expect(service.assertCheckoutEligible(customer,ids.appointment)).rejects.toMatchObject({code:'PAYMENT_NOT_ELIGIBLE'});});
});
