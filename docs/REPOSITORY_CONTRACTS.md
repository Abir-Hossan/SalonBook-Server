# Repository contracts — Phase 02

Persistence adapters must implement the contracts in `src/interfaces/repositories.ts`. Feature services depend on these interfaces rather than concrete memory storage.

## ServiceRepository

- `list(filters)`: active-only by default; supports name search, category, price range, sorting, pagination and explicit admin-only inactive inclusion.
- `findById(id)`
- `create(input)`
- `update(id, patch)`
- `delete(id)`
- `hasAppointments(id)`: prevents deleting service history.

## AppointmentRepository

- `list(filters)`, `findById(id)`, `create(input)`, `update(id, patch)`
- `findActiveSlot(date, timeSlot)`: checks pending/confirmed slot conflicts.
- `hasServiceAppointments(serviceId)`: protects historical service references.

The memory adapter checks within one process only. MongoDB must implement atomic slot acquisition / unique active-slot indexing in Phase 03; a read-then-write check is not sufficient under concurrent requests or multiple processes.

## UserRepository

- `list(filters)`, `findById(id)`
- `update(id, patch)` where patch is restricted at type level to `name`, `image`, `isBlocked`.

## TransactionRepository

- `list(filters)`, `findById(id)`
- No `markPaid`, `createPaid`, or client-callable payment mutation method is exposed. Phase 06's verified webhook integration will define the controlled persistence operation after Stripe event verification and idempotency rules are implemented.

## Authentication seam

`PrincipalResolver` is injected at app composition. The default `phase04PrincipalResolver` returns an explicit 501 until Phase 04. Tests may inject a resolver directly into `createApp`; no HTTP header or request body can create a principal.
