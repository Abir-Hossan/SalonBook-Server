import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { CommandStartedEvent, CommandSucceededEvent, CommandFailedEvent, ObjectId } from 'mongodb';

const collections = new Set([
  'Appointments', 'Services', 'Transactions', 'Users', 'BetterAuthAccounts',
  'BetterAuthSessions', 'BetterAuthVerifications', 'CustomerSessions',
]);

export function qaTarget(atlasUri?: string, localUri?: string) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Database suites require NODE_ENV=test.');
  if (atlasUri && localUri) throw new Error('Select exactly one QA target for this suite.');
  if (localUri && /^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[a-zA-Z0-9_-]+$/.test(localUri)) return localUri;
  if (!atlasUri || process.env.SALONBOOK_ATLAS_QA_MODE !== 'confirmed-disposable') {
    throw new Error('Atlas tests require a dedicated URI and explicit SALONBOOK_ATLAS_QA_MODE confirmation.');
  }
  const parseAtlas = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol === 'mongodb+srv:' && !url.port && !url.hash &&
          /^[a-z\d.-]+\.mongodb\.net$/i.test(url.hostname)) return url;
    } catch {
      // Keep URI parser diagnostics out of test output.
    }
    return null;
  };
  const target = parseAtlas(atlasUri);
  const application = process.env.MONGODB_URI?.trim();
  const knownApplication = application && parseAtlas(application);
  if (!target || !target.username || !target.password ||
      target.hostname.toLowerCase() !== process.env.SALONBOOK_ATLAS_QA_HOST?.trim().toLowerCase() ||
      (application && (!knownApplication || knownApplication.hostname.toLowerCase() === target.hostname.toLowerCase())) ||
      /(^|[._-])(prod|production)([._-]|$)/i.test(target.hostname + '.' + target.pathname.replace(/^\//, '')) ||
      [...target.searchParams].some(([key, value]) =>
        (/^(tls|ssl)$/i.test(key) && value.toLowerCase() !== 'true') ||
        /^(tlsinsecure|tlsallowinvalidcertificates|tlsallowinvalidhostnames|directconnection)$/i.test(key))) {
    throw new Error('Atlas target failed the QA hostname, application configuration, or transport safety checks.');
  }
  return atlasUri;
}

export function createQaDatabase(prefix: 'salonbook_qa' | 'salonbook_auth_qa') {
  const name = prefix + '_' + randomUUID().replaceAll('-', '');
  const tracked = new Map<string, Map<string, ObjectId>>();
  const pending = new Map<number, { collection: string; inserts: unknown[] }>();
  let ambiguousWrite = false;
  let client: ReturnType<typeof mongoose.connection.getClient> | undefined;
  let database: typeof mongoose.connection.db;
  let connectionAttempted = false;

  function identityMatches() {
    return Boolean(database && mongoose.connection.readyState === 1 &&
      mongoose.connection.name === name && mongoose.connection.db === database &&
      mongoose.connection.getClient() === client);
  }

  function track(collection: string, value: unknown) {
    if (!(value instanceof mongoose.mongo.ObjectId)) {
      ambiguousWrite = true;
      return;
    }
    const ids = tracked.get(collection) ?? new Map<string, ObjectId>();
    ids.set(value.toHexString(), value);
    tracked.set(collection, ids);
  }

  function onStarted(event: CommandStartedEvent) {
    if (event.databaseName !== name) return;
    const { insert, documents, update, updates } = event.command;
    if (typeof insert === 'string' && collections.has(insert) && Array.isArray(documents)) {
      pending.set(event.requestId, { collection: insert, inserts: documents.map(document => document._id) });
    }
    if (typeof update === 'string' && collections.has(update) &&
        Array.isArray(updates) && updates.some(operation => operation.upsert === true)) {
      pending.set(event.requestId, { collection: update, inserts: [] });
    }
  }

  function onSucceeded(event: CommandSucceededEvent) {
    const write = pending.get(event.requestId);
    pending.delete(event.requestId);
    if (!write) return;
    const reply = event.reply as { n?: number; writeConcernError?: unknown; upserted?: { _id: unknown }[] };
    if (reply.writeConcernError) ambiguousWrite = true;
    // With a partial ordered batch, unattempted rows must never be marked as owned.
    if (write.inserts.length && reply.n === write.inserts.length) {
      for (const id of write.inserts) track(write.collection, id);
    } else if (write.inserts.length && reply.n !== 0) {
      const errors = (reply as { writeErrors?: { index: number }[] }).writeErrors;
      const successful = write.inserts.map((id, index) => ({ id, index }))
        .filter(({ index }) => !errors?.some(error => error.index === index));
      // Current fixtures use single-document writes or ordered insertMany.
      if (errors?.length === 1 && errors[0]?.index === reply.n) {
        for (const id of write.inserts.slice(0, reply.n)) track(write.collection, id);
      } else if (errors?.length && successful.length === reply.n) {
        for (const { id } of successful) track(write.collection, id);
      } else ambiguousWrite = true;
    }
    for (const item of reply.upserted ?? []) track(write.collection, item._id);
  }

  function onFailed(event: CommandFailedEvent) {
    if (pending.delete(event.requestId)) ambiguousWrite = true;
  }

  return {
    name,
    async connect(uri: string) {
      if (!/^salonbook_(?:auth_)?qa_[a-f\d]{32}$/.test(name) ||
          mongoose.connection.readyState !== 0 ||
          name === process.env.MONGODB_DB_NAME?.trim()) {
        throw new Error('Refusing to open an unsafe QA namespace.');
      }
      connectionAttempted = true;
      try {
        await mongoose.connect(uri, {
          dbName: name, monitorCommands: true, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10_000,
        });
        client = mongoose.connection.getClient();
        database = mongoose.connection.db;
        if (!identityMatches() || !database || (await database.listCollections({}, { nameOnly: true }).toArray()).length) {
          throw new Error('QA namespace is not empty or its identity cannot be confirmed.');
        }
      } catch {
        throw new Error('QA database setup failed. Check connectivity, namespace isolation and permissions.');
      }
      client.on('commandStarted', onStarted).on('commandSucceeded', onSucceeded).on('commandFailed', onFailed);
    },
    async cleanup() {
      if (!tracked.size && !ambiguousWrite && !pending.size) return;
      if (!identityMatches() || !database) throw new Error('Refusing QA cleanup because database identity is uncertain.');
      const outcomes = await Promise.allSettled([...tracked].map(async ([collection, ids]) => {
        await database!.collection(collection).deleteMany({ _id: { $in: [...ids.values()] } });
        tracked.delete(collection);
      }));
      if (outcomes.some(outcome => outcome.status === 'rejected') || ambiguousWrite || pending.size) {
        throw new Error('QA cleanup incomplete. Review the isolated namespace for unresolved writes.');
      }
    },
    async close() {
      try {
        await this.cleanup();
      } finally {
        client?.off('commandStarted', onStarted).off('commandSucceeded', onSucceeded).off('commandFailed', onFailed);
        if (connectionAttempted) await mongoose.disconnect();
      }
    },
  };
}
