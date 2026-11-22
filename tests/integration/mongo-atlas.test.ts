import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AppointmentModel } from '../../src/database/models/appointment.model';
import { ServiceModel } from '../../src/database/models/service.model';
import { UserModel } from '../../src/database/models/user.model';
import { TransactionModel } from '../../src/database/models/transaction.model';
import { createMongoRepositories } from '../../src/database/repositories/mongo.repositories';
import { customer, ids, serviceSeed, userSeed } from '../fixtures/data';

import { createQaDatabase, qaTarget } from '../fixtures/qa-database';

const uri = process.env.SALONBOOK_ATLAS_TEST_URI;
const localUri = process.env.SALONBOOK_PHASE03_LOCAL_TEST_URI;
const qa = createQaDatabase('salonbook_qa');
const repositories = createMongoRepositories();
const secondCustomer = { ...customer, id: '100000000000000000000002' };
const first = request(createApp({ repositories, principalResolver: async () => customer }));
const second = request(createApp({ repositories, principalResolver: async () => secondCustomer }));

const day = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
const slot = (timeSlot: string) => ({ serviceId: ids.service, appointmentDate: day, timeSlot });

describe.skipIf(!uri && !localUri)('Phase 03 MongoDB appointment persistence (' + (uri ? 'Atlas' : 'loopback') + ')', () => {
  beforeAll(async () => {
    await qa.connect(qaTarget(uri, localUri));
    await Promise.all([UserModel.createIndexes(), ServiceModel.createIndexes(), AppointmentModel.createIndexes(), TransactionModel.createIndexes()]);
    const service = serviceSeed[0]!;
    const patron = userSeed[0]!;
    await ServiceModel.create({ ...service, _id: service.id });
    await UserModel.insertMany([
      { ...patron, _id: customer.id },
      { ...patron, _id: secondCustomer.id, email: 'second@example.com' },
    ]);
  }, 30000);

  afterAll(() => qa.close(), 15000);

  it('connects and creates the unique partial index on active slots', async () => {
    const database = mongoose.connection.db!;
    expect(await database.command({ ping: 1 })).toMatchObject({ ok: 1 });
    expect(await AppointmentModel.collection.indexes()).toContainEqual(expect.objectContaining({
      name: 'appointments_active_slot_unique', unique: true, key: { activeSlotKey: 1 },
      partialFilterExpression: { activeSlotKey: { $type: 'string' } },
    }));
  });

  it('creates an appointment through HTTP and reads back the persisted document', async () => {
    const response = await first.post('/api/appointments').send(slot('09:30 AM')).expect(201);
    const bookingId = response.body.data.id;
    expect(await AppointmentModel.findById(bookingId).lean()).toMatchObject({
      appointmentDate: day, timeSlot: '09:30 AM', status: 'pending', paymentStatus: 'unpaid', servicePrice: 165,
    });
    const loaded = await first.get('/api/appointments/' + bookingId).expect(200);
    expect(loaded.body.data.customerId).toBe(customer.id);
  });

  it('returns HTTP 409 with the slot conflict code for an active slot', async () => {
    await first.post('/api/appointments').send(slot('10:30 AM')).expect(201);
    const conflict = await second.post('/api/appointments').send(slot('10:30 AM')).expect(409);
    expect(conflict.body.errors).toContainEqual(expect.objectContaining({ code: 'APPOINTMENT_SLOT_CONFLICT' }));
  });

  it('retains the cancelled document and permits rebooking the slot', async () => {
    const created = await first.post('/api/appointments').send(slot('11:30 AM')).expect(201);
    const id = created.body.data.id;
    await first.patch('/api/appointments/' + id + '/cancel').expect(200);
    expect(await AppointmentModel.findById(id).lean()).toMatchObject({ status: 'cancelled', activeSlotKey: null });
    const rebooked = await second.post('/api/appointments').send(slot('11:30 AM')).expect(201);
    expect(rebooked.body.data.id).not.toBe(id);
    expect(await AppointmentModel.countDocuments({ activeSlotKey: day + '|11:30 AM' })).toBe(1);
  });

  it('admits exactly one concurrent request for the same slot', async () => {
    const responses = await Promise.all([
      first.post('/api/appointments').send(slot('01:00 PM')),
      second.post('/api/appointments').send(slot('01:00 PM')),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.errors[0].code).toBe('APPOINTMENT_SLOT_CONFLICT');
    expect(await AppointmentModel.countDocuments({ activeSlotKey: day + '|01:00 PM' })).toBe(1);
  });

  it('maps MongoDB duplicate-key rejection to a repository conflict', async () => {
    const record = {
      ...slot('02:30 PM'), customerId: customer.id, servicePrice: 165,
      status: 'confirmed' as const, paymentStatus: 'unpaid' as const,
    };
    await repositories.appointments.create(record);
    await expect(repositories.appointments.create({ ...record, customerId: secondCustomer.id }))
      .rejects.toMatchObject({ statusCode: 409, code: 'APPOINTMENT_SLOT_CONFLICT' });
  });
});
