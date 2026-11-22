import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createQaDatabase, qaTarget } from '../fixtures/qa-database';

const uri = process.env.SALONBOOK_PHASE03_LOCAL_TEST_URI;

describe.skipIf(!uri)('QA fixture cleanup on loopback MongoDB', () => {
  it('cleans confirmed inserts, ordered partial writes and upserts while preserving unrelated rows', async () => {
    const target = qaTarget(undefined, uri);
    const first = createQaDatabase('salonbook_qa');
    const second = createQaDatabase('salonbook_qa');
    expect(first.name).not.toBe(second.name);
    for (const qa of [first, second]) {
      const external = new mongoose.mongo.MongoClient(target);
      try {
        await qa.connect(target);
        const fixtures = mongoose.connection.db!.collection('Users');
        const unrelated = external.db(qa.name).collection('Users');
        const sentinel = new mongoose.mongo.ObjectId();
        const beforeFailure = new mongoose.mongo.ObjectId();
        const unattempted = new mongoose.mongo.ObjectId();
        await unrelated.insertMany([{ _id: sentinel, tag: 'other' }, { _id: unattempted, tag: 'other' }]);
        await fixtures.insertOne({ tag: 'fixture' });
        await fixtures.updateOne({ tag: randomUUID() }, { $setOnInsert: { kind: 'upserted fixture' } }, { upsert: true });
        await expect(fixtures.insertMany([
          { _id: beforeFailure, tag: 'partial fixture' },
          { _id: sentinel, tag: 'duplicate' },
          { _id: unattempted, tag: 'unattempted' },
        ])).rejects.toMatchObject({ code: 11000 });

        expect(await fixtures.countDocuments()).toBe(5);
        await qa.cleanup();
        await qa.cleanup();
        expect(await fixtures.countDocuments()).toBe(2);
        expect(await unrelated.countDocuments({ _id: { $in: [sentinel, unattempted] }, tag: 'other' })).toBe(2);
        await unrelated.deleteMany({ _id: { $in: [sentinel, unattempted] } });
      } finally {
        try { await qa.close(); } finally { await external.close(); }
      }
    }
  });
});
