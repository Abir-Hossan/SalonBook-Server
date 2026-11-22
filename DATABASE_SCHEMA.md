# SalonBook MongoDB schema — Phase 03

Phase 03 introduces MongoDB persistence through Mongoose while preserving the Phase 02 repository contracts and API response shapes. The four approved business collections are `Users`, `Services`, `Appointments`, and `Transactions`. Authentication-provider support collections remain out of scope until Phase 04.

## Collections and constraints

### Users
- `name`, `email` (normalized lowercase), optional `image`, `role` (`customer|admin`), `isBlocked`, `createdAt`.
- Unique index: `email`.
- Listing index: `role`, `isBlocked`, `createdAt`.

### Services
- `serviceName`, `category`, `description`, `price`, `duration`, `image`, `status` (`active|inactive`), `createdAt`.
- Indexes: `status + category`, text search on `serviceName + description`, and `price`.

### Appointments
- `serviceId` and `customerId` are ObjectId references; `appointmentDate` is ISO `YYYY-MM-DD`; `timeSlot`, optional `message`, immutable `servicePrice` snapshot, `paymentStatus`, `status`, `createdAt`.
- `activeSlotKey` is an internal concurrency key (`date|timeSlot`). It is null for cancelled appointments.
- Unique partial index on `activeSlotKey` prevents two non-cancelled appointments from claiming the same salon-wide slot, including concurrent requests.
- Additional indexes: `customerId + createdAt`, `status + appointmentDate`, and `serviceId`.

### Transactions
- `appointmentId`, `customerId`, `amount`, three-letter uppercase `currency`, optional `stripeSessionId`, `status`, `createdAt`.
- Index on `appointmentId` and sparse unique index on `stripeSessionId`.
- Payment creation/updates and Stripe webhook behavior remain Phase 06 work; Phase 03 only adds the collection and read repository contract.

## Runtime configuration

Copy `.env.example` to `.env` and configure `MONGODB_URI`. Local default example:

`mongodb://127.0.0.1:27017/salonbook`

Optional `MONGODB_DB_NAME` overrides the database name in the URI. The API server now requires a reachable MongoDB database before listening. `SEED_DEMO_CATALOG=true` in development idempotently inserts the eight demo services without overwriting existing records.

## Notes and boundaries

- IDs exposed through the API remain 24-character ObjectId strings, preserving the existing repository/domain contract.
- The app factory still defaults to in-memory repositories when used directly by isolated API tests. The production/dev server entry point explicitly injects Mongo repositories after a successful connection.
- Phase 04 authentication, Phase 05 frontend integration, Phase 06 Stripe/ImgBB, and Phase 07 deployment are not implemented here.
- Existing records in a database must be checked for duplicate emails, duplicate appointment slots, and duplicate appointment transaction references before index creation. Index creation intentionally fails fast rather than silently discarding conflicting data.
